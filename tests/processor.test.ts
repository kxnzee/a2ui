import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { NodeResolver, getValue, A2uiClientMessageSchema, A2uiMessageListSchema, MessageProcessor, type WritableBinding } from '@a2ui/web_core/v0_9';
import { createA2uiProcessor } from '../src/a2ui/processor.js';
import { cards, cardsCatalog as a2uiCatalog } from '../src/a2ui/cards.js';
import { questionMessages, metricMessages, removeQuestion } from './fixtures.js';
const resolvers: NodeResolver[] = [];
afterEach(() => { for (const r of resolvers.splice(0)) r.dispose(); });
function props(processor: ReturnType<typeof createA2uiProcessor>) {
  const r = new NodeResolver(processor.model.getSurface('question')!, a2uiCatalog); resolvers.push(r);
  return getValue(getValue(r.rootNode)!.props) as unknown as {
    selected: WritableBinding<string>; disabled: WritableBinding<boolean>; onSelect: () => void;
  };
}

test('native SDK resolves selected binding into a standard action without changing request state', () => {
  const answers: unknown[] = [];
  const processor = createA2uiProcessor(message => { answers.push(message); }, [a2uiCatalog]);
  assert.ok(processor instanceof MessageProcessor);
  processor.processMessages(questionMessages());
  const p = props(processor); p.selected.set('orders'); p.onSelect();
  const parsed = A2uiClientMessageSchema.parse(answers[0]);
  assert.ok('action' in parsed);
  if ('action' in parsed) {
    assert.equal(parsed.action.sourceComponentId, 'root');
    assert.equal(parsed.action.surfaceId, 'question');
    assert.deepEqual(parsed.action.context, { optionId: 'orders' });
  }
  assert.equal(props(processor).disabled.value, false);
  assert.equal(processor.model.getSurface('question')!.dataModel.get('/answered'), undefined);
  processor.model.dispose();
});

test('SDK owns surface lifecycle and updates; action names remain application-defined', () => {
  const answers: string[] = []; const created: string[] = []; const deleted: string[] = [];
  const processor = createA2uiProcessor(message => { answers.push(message.action.name); }, [a2uiCatalog]);
  const create = processor.onSurfaceCreated(surface => { created.push(surface.id); });
  const remove = processor.onSurfaceDeleted(id => { deleted.push(id); });
  const messages = questionMessages();
  if ('updateComponents' in messages[2]) messages[2].updateComponents.components[0].onSelect.event.name = 'choose_metric';
  processor.processMessages(messages); props(processor).selected.set('revenue'); props(processor).onSelect();
  assert.deepEqual(answers, ['choose_metric']);
  processor.processMessages([{ version: 'v0.9', updateDataModel: { surfaceId: 'question', path: '/disabled', value: true } }]);
  assert.equal(props(processor).disabled.value, true);
  processor.processMessages(metricMessages()); processor.processMessages([removeQuestion]);
  assert.deepEqual(created, ['question', 'result']); assert.deepEqual(deleted, ['question']);
  assert.equal(processor.model.surfacesMap.size, 1);
  create.unsubscribe(); remove.unsubscribe(); processor.model.dispose();
});

test('SDK validates catalog/properties; protocol schema rejects chat history arrays', () => {
  const processor = createA2uiProcessor(() => {}, [a2uiCatalog]);
  assert.throws(() => processor.processMessages([{ version: 'v0.9', createSurface: { surfaceId: 'bad', catalogId: 'unknown' } }]));
  processor.processMessages(metricMessages());
  for (const component of [
    { id: 'root', component: 'MetricCard', title: 'Bad', value: '123' },
    { id: 'root', component: 'MetricCard', title: 'Bad', value: Infinity },
    { id: 'root', component: 'MetricCard', title: 'Bad', value: 1, extra: true },
  ]) assert.throws(() => processor.processMessages([{ version: 'v0.9', updateComponents: { surfaceId: 'result', components: [component] } }]));
  assert.equal(processor.model.getSurface('result')!.componentsModel.get('root')!.properties.value, 1250000);
  assert.throws(() => processor.processMessages([{ version: 'v0.9', updateComponents: { surfaceId: 'missing', components: [{ id: 'root', component: 'MetricCard', title: 'Missing', value: 1 }] } }]));
  // Deliberately bypass TS to test untrusted transport input against SDK validation.
  assert.throws(() => A2uiMessageListSchema.parse([{ role: 'assistant', content: 'text' }]));
  processor.model.dispose();
});

test('agent configuration comes from the renderer catalog; examples stay outside the UI module', async () => {
  const { getAgentConfiguration } = await import('../src/a2ui/agent.js');
  const config = getAgentConfiguration(cards);
  assert.equal(config.catalogSchema.catalogId, a2uiCatalog.id);
  assert.deepEqual(Object.keys(config.catalogSchema.components!).sort(), [...a2uiCatalog.components.keys()].sort());
  const metric = config.catalogSchema.components!.MetricCard.allOf![1];
  assert.equal(metric.properties!.title.minLength, 1);
  assert.equal(metric.properties!.value.type, 'number');
  assert.deepEqual(metric.required, ['component', 'title', 'value']);
  const clarification = config.catalogSchema.components!.ClarificationCard.allOf![1];
  assert.equal(clarification.properties!.options.minItems, 2);
  assert.equal(clarification.properties!.selected.$ref, 'common_types.json#/$defs/DynamicString');
  assert.equal(clarification.properties!.onSelect.$ref, 'common_types.json#/$defs/Action');
  assert.match(config.instructions, /<a2ui>/);
  assert.deepEqual(config.capabilities['v0.9']?.supportedCatalogIds, [a2uiCatalog.id]);
  assert.ok(config.protocolSchema.$defs.CreateSurfaceMessage);
  assert.equal('examples' in config, false);
  const processor = createA2uiProcessor(() => {}, [a2uiCatalog]);
  processor.processMessages([...questionMessages(), ...metricMessages()]);
  assert.equal(processor.model.surfacesMap.size, 2); processor.model.dispose();
});

test('exported configuration cannot mutate SDK schemas or subsequent exports', async () => {
  const { getAgentConfiguration } = await import('../src/a2ui/agent.js');
  const baseline = getAgentConfiguration(cards); const exported = getAgentConfiguration(cards);
  exported.catalogSchema.catalogId = 'mutated';
  exported.protocolSchema.$defs.CreateSurfaceMessage.required.push('mutated');
  exported.capabilities['v0.9']!.supportedCatalogIds = [];
  assert.deepEqual(getAgentConfiguration(cards), baseline);
  assert.equal(a2uiCatalog.id, baseline.catalogSchema.catalogId);
});

test('clarification only requires writable selected; disabled is optional', () => {
  const messages = questionMessages(); assert.ok('updateComponents' in messages[2]);
  if (!('updateComponents' in messages[2])) return;
  delete messages[2].updateComponents.components[0].disabled;
  const processor = createA2uiProcessor(() => {}, [a2uiCatalog]); processor.processMessages(messages);
  const card = structuredClone(messages[2].updateComponents.components[0]); card.selected = 'literal';
  assert.throws(() => processor.processMessages([{ version: 'v0.9', updateComponents: { surfaceId: 'question', components: [card] } }]));
  processor.model.dispose();
});

test('core works with a custom catalog and does not know the bundled cards', async () => {
  const { Catalog } = await import('@a2ui/web_core/v0_9');
  const { createComponentImplementation } = await import('@a2ui/react/v0_9');
  const { z } = await import('zod-a2ui');
  const { getAgentConfiguration } = await import('../src/a2ui/agent.js');
  const Badge = createComponentImplementation(
    { name: 'Badge', schema: z.object({ text: z.string() }).strict().describe('Бейдж с текстом.') },
    () => null,
  );
  const catalog = new Catalog('urn:test:badge:v1', [Badge]);
  const processor = createA2uiProcessor(() => {}, [catalog]);
  processor.processMessages([
    { version: 'v0.9', createSurface: { surfaceId: 's', catalogId: catalog.id } },
    { version: 'v0.9', updateComponents: { surfaceId: 's', components: [{ id: 'root', component: 'Badge', text: 'ok' }] } },
  ]);
  assert.equal(processor.model.getSurface('s')!.componentsModel.get('root')!.type, 'Badge');
  // Компонентов из встроенных карточек в чужом каталоге нет.
  assert.equal(catalog.components.has('MetricCard'), false);
  const config = getAgentConfiguration({ catalog, instructions: 'Только бейджи.' });
  assert.deepEqual(Object.keys(config.catalogSchema.components!), ['Badge']);
  assert.equal(config.catalogSchema.components!.Badge.description, 'Бейдж с текстом.');
  assert.match(config.instructions, /Только бейджи\./);
  assert.doesNotMatch(config.instructions, /ClarificationCard/);
  const custom = getAgentConfiguration({ catalog, instructions: 'x' }, { framing: { open: '[[ui]]', close: '[[/ui]]' } });
  assert.match(custom.instructions, /\[\[ui\]\]JSON\[\[\/ui\]\]/);
  assert.equal(getAgentConfiguration({ catalog, instructions: 'x' }, { protocolInstructions: 'Свой текст' }).instructions, 'Свой текст\nx');
  processor.model.dispose();
});
