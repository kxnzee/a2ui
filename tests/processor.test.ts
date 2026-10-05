import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { NodeResolver, getValue, A2uiClientMessageSchema, MessageProcessor, type WritableBinding } from '@a2ui/web_core/v0_9';
import { createA2uiProcessor } from '../src/a2ui/processor.js';
import { a2uiCatalog } from '../src/a2ui/catalog.js';
import { questionMessages, metricMessages, removeQuestion } from './fixtures.js';
const resolvers: NodeResolver[] = [];
afterEach(() => { for (const r of resolvers.splice(0)) r.dispose(); });
function props(processor: ReturnType<typeof createA2uiProcessor>) {
  const r = new NodeResolver(processor.getSurface('question')!, a2uiCatalog); resolvers.push(r);
  return getValue(getValue(r.rootNode)!.props) as unknown as {
    selected: WritableBinding<string>; disabled: WritableBinding<boolean>; onSelect: () => void;
  };
}

test('native SDK resolves selected binding into a standard action without changing request state', () => {
  const answers: unknown[] = [];
  const processor = createA2uiProcessor(message => { answers.push(message); });
  assert.ok(processor instanceof MessageProcessor);
  processor.processMessages(questionMessages());
  const p = props(processor); p.selected.set('orders'); p.onSelect();
  const parsed = A2uiClientMessageSchema.parse(answers[0]);
  assert.ok('action' in parsed);
  if ('action' in parsed) {
    assert.equal(parsed.action.sourceComponentId, 'root');
    assert.equal(parsed.action.surfaceId, 'question');
    assert.deepEqual(parsed.action.context, { questionId: 'metric-1', optionId: 'orders' });
  }
  assert.equal(props(processor).disabled.value, false);
  assert.equal(processor.getSurface('question')!.dataModel.get('/answered'), undefined);
  processor.dispose();
});

test('SDK owns surface lifecycle and updates; action names remain application-defined', () => {
  const answers: string[] = []; const created: string[] = []; const deleted: string[] = [];
  const processor = createA2uiProcessor(message => { answers.push(message.action.name); });
  const create = processor.onSurfaceCreated(surface => { created.push(surface.id); });
  const remove = processor.onSurfaceDeleted(id => { deleted.push(id); });
  const messages = questionMessages();
  if ('updateComponents' in messages[2]) messages[2].updateComponents.components[0].onSelect.event.name = 'choose_metric';
  processor.processMessages(messages); props(processor).selected.set('revenue'); props(processor).onSelect();
  assert.deepEqual(answers, ['choose_metric']);
  processor.processMessages({ version: 'v0.9', updateDataModel: { surfaceId: 'question', path: '/disabled', value: true } });
  assert.equal(props(processor).disabled.value, true);
  processor.processMessages(metricMessages()); processor.processMessages(removeQuestion);
  assert.deepEqual(created, ['question', 'result']); assert.deepEqual(deleted, ['question']);
  assert.equal(processor.getSurfaces().size, 1);
  create.unsubscribe(); remove.unsubscribe(); processor.dispose();
});

test('SDK rejects unknown catalogs, components, invalid properties and chat history arrays', () => {
  const processor = createA2uiProcessor(() => {});
  assert.throws(() => processor.processMessages({ version: 'v0.9', createSurface: { surfaceId: 'bad', catalogId: 'unknown' } }));
  processor.processMessages(metricMessages());
  for (const component of [
    { id: 'root', component: 'Unknown' },
    { id: 'root', component: 'MetricCard', title: 'Bad', value: '123' },
    { id: 'root', component: 'MetricCard', title: 'Bad', value: Infinity },
    { id: 'root', component: 'MetricCard', title: 'Bad', value: 1, extra: true },
  ]) assert.throws(() => processor.processMessages({ version: 'v0.9', updateComponents: { surfaceId: 'result', components: [component] } }));
  assert.equal(processor.getSurface('result')!.componentsModel.get('root')!.properties.value, 1250000);
  assert.throws(() => processor.processMessages({ version: 'v0.9', updateComponents: { surfaceId: 'missing', components: [{ id: 'root', component: 'MetricCard', title: 'Missing', value: 1 }] } }));
  // Deliberately bypass TS to test untrusted transport input against SDK validation.
  assert.throws(() => processor.processMessages([{ role: 'assistant', content: 'text' }] as any));
  processor.dispose();
});

test('agent configuration comes from the renderer catalog; examples stay outside the UI module', async () => {
  const { getAgentConfiguration } = await import('../src/a2ui/agent.js');
  const config = getAgentConfiguration();
  assert.deepEqual(config.catalogSchema, a2uiCatalog.catalogSchema);
  assert.match(config.instructions, /<a2ui>/);
  assert.deepEqual(config.capabilities['v0.9']?.supportedCatalogIds, [a2uiCatalog.id]);
  assert.ok(config.protocolSchema.$defs.CreateSurfaceMessage);
  assert.equal('examples' in config, false);
  const processor = createA2uiProcessor(() => {});
  processor.processMessages([...questionMessages(), ...metricMessages()]);
  assert.equal(processor.getSurfaces().size, 2); processor.dispose();
});

test('exported configuration cannot mutate SDK schemas or subsequent exports', async () => {
  const { getAgentConfiguration } = await import('../src/a2ui/agent.js');
  const baseline = getAgentConfiguration(); const exported = getAgentConfiguration();
  exported.catalogSchema.title = 'mutated';
  exported.protocolSchema.$defs.CreateSurfaceMessage.required.push('mutated');
  exported.capabilities['v0.9']!.supportedCatalogIds = [];
  assert.deepEqual(getAgentConfiguration(), baseline);
  assert.deepEqual(a2uiCatalog.catalogSchema, baseline.catalogSchema);
});

test('clarification only requires writable selected; disabled is optional', () => {
  const messages = questionMessages(); assert.ok('updateComponents' in messages[2]);
  if (!('updateComponents' in messages[2])) return;
  delete messages[2].updateComponents.components[0].disabled;
  const processor = createA2uiProcessor(() => {}); processor.processMessages(messages);
  const card = structuredClone(messages[2].updateComponents.components[0]); card.selected = 'literal';
  assert.throws(() => processor.processMessages({ version: 'v0.9', updateComponents: { surfaceId: 'question', components: [card] } }));
  processor.dispose();
});
