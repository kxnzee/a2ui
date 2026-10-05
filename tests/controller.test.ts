import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { NodeResolver, getValue, A2uiClientMessageSchema, type WritableBinding } from '@a2ui/web_core/v0_9';
import { createA2uiController } from '../src/a2ui/controller.js';
import { a2uiCatalog } from '../src/a2ui/catalog.js';
import { questionMessages, metricMessages, removeQuestion } from './fixtures.js';
const resolvers: NodeResolver[] = [];
afterEach(() => { for (const r of resolvers.splice(0)) r.dispose(); });
function props(c: ReturnType<typeof createA2uiController>) {
  const surface = c.getSnapshot().find(e => e.surface.id === 'question')!.surface;
  const r = new NodeResolver(surface, a2uiCatalog); resolvers.push(r);
  return getValue(getValue(r.rootNode)!.props) as unknown as {
    selected: WritableBinding<string>; disabled: WritableBinding<boolean>;
    answered: WritableBinding<boolean>; error: WritableBinding<string>; onSelect: () => void;
  };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
test('standard messages produce standard action and block repeated clicks', async () => {
  const answers: unknown[] = []; let release!: () => void;
  const c = createA2uiController(message => { answers.push(message); return new Promise<void>(r => release = r); });
  questionMessages().forEach(m => c.processMessage(m));
  const p = props(c); p.selected.set('orders'); p.onSelect(); p.onSelect();
  assert.equal(answers.length, 1); assert.equal(props(c).disabled.value, true);
  const parsed = A2uiClientMessageSchema.parse(answers[0]);
  assert.ok('action' in parsed);
  if ('action' in parsed) {
    assert.equal(parsed.action.sourceComponentId, 'root');
    assert.equal(parsed.action.surfaceId, 'question');
    assert.deepEqual(parsed.action.context, { questionId: 'metric-1', optionId: 'orders' });
  }
  release(); await tick(); assert.equal(props(c).answered.value, true);
  p.onSelect(); assert.equal(answers.length, 1); c.dispose();
});
test('failed transport unlocks retry; SDK updates and deletes surfaces', async () => {
  let calls = 0; const c = createA2uiController(() => { if (++calls === 1) throw new Error('offline'); });
  questionMessages().forEach(m => c.processMessage(m));
  const p = props(c); p.selected.set('revenue'); p.onSelect(); await tick();
  assert.equal(props(c).disabled.value, false); assert.ok(props(c).error.value);
  p.onSelect(); await tick(); assert.equal(props(c).answered.value, true);
  c.processMessage({ version: 'v0.9', updateDataModel: { surfaceId: 'question', path: '/error', value: 'Обновлено' } });
  assert.equal(props(c).error.value, 'Обновлено');
  metricMessages().forEach(m => c.processMessage(m)); assert.equal(c.getSnapshot().length, 2);
  c.processMessage(removeQuestion); assert.equal(c.getSnapshot()[0].surface.id, 'result');
  c.clear(); assert.deepEqual(c.getSnapshot(), []); c.dispose();
});
test('late action completion cannot update a recreated surface', async () => {
  let release!: () => void;
  const c = createA2uiController(() => new Promise<void>(r => release = r));
  questionMessages().forEach(m => c.processMessage(m));
  const p = props(c); p.selected.set('revenue'); p.onSelect();
  c.processMessage(removeQuestion); questionMessages('next-question').forEach(m => c.processMessage(m));
  release(); await tick(); assert.equal(props(c).answered.value, false); c.dispose();
});
test('SDK rejects unknown catalog, component, properties and missing surfaces', () => {
  const c = createA2uiController(() => {});
  assert.throws(() => c.processMessage({ version: 'v0.9', createSurface: { surfaceId: 'bad', catalogId: 'unknown' } }));
  metricMessages().forEach(m => c.processMessage(m));
  for (const component of [
    { id: 'root', component: 'Unknown' },
    { id: 'root', component: 'MetricCard', title: 'Bad', value: '123' },
    { id: 'root', component: 'MetricCard', title: 'Bad', value: Infinity },
    { id: 'root', component: 'MetricCard', title: 'Bad', value: 1, extra: true },
  ]) assert.throws(() => c.processMessage({ version: 'v0.9', updateComponents: { surfaceId: 'result', components: [component] } }));
  assert.equal(c.getSnapshot()[0].surface.componentsModel.get('root')!.properties.value, 1250000);
  assert.throws(() => c.processMessage({ version: 'v0.9', updateComponents: { surfaceId: 'missing', components: [{ id: 'root', component: 'MetricCard', title: 'Missing', value: 1 }] } }));
  assert.throws(() => c.processMessage({ type: 'metric', props: {} }));
  c.dispose(); assert.throws(() => c.processMessage(metricMessages()[0]), /закрыт/);
});

test('agent configuration comes from the renderer catalog and contains executable standard examples', async () => {
  const { getAgentConfiguration } = await import('../src/a2ui/agent.js');
  const config = getAgentConfiguration();
  assert.deepEqual(config.catalogSchema, a2uiCatalog.catalogSchema);
  assert.match(config.instructions, /<a2ui>/);
  assert.deepEqual(config.capabilities['v0.9']?.supportedCatalogIds, [a2uiCatalog.id]);
  assert.ok(config.protocolSchema.$defs.CreateSurfaceMessage);
  const c = createA2uiController(() => {});
  [...config.examples.clarification, ...config.examples.metric].forEach(m => c.processMessage(m));
  assert.equal(c.getSnapshot().length, 2); c.dispose();
});

test('native A2UI array entrypoint rejects chat history arrays', () => {
  const c = createA2uiController(() => {});
  c.processMessages(metricMessages()); assert.equal(c.getSnapshot().length, 1);
  assert.throws(() => c.processMessages([{ role: 'assistant', content: 'text' }]));
  c.dispose();
});

test('catalog rejects inconsistent clarification actions and overlapping state bindings', () => {
  const c = createA2uiController(() => {});
  questionMessages().forEach(message => c.processMessage(message));
  const message = questionMessages()[2];
  assert.ok('updateComponents' in message);
  if (!('updateComponents' in message)) return;
  const original = message.updateComponents.components[0];
  for (const modify of [
    (card: any) => { card.onSelect.event.name = 'wrong'; },
    (card: any) => { card.onSelect.event.context.questionId = 'wrong'; },
    (card: any) => { card.onSelect.event.context.optionId = 'orders'; },
    (card: any) => { card.onSelect.event.context.optionId.path = '/other'; },
    (card: any) => { card.disabled.path = card.selected.path; },
    (card: any) => { card.error.path = `${card.selected.path}/nested`; },
  ]) {
    const card = structuredClone(original); modify(card);
    assert.throws(() => c.processMessage({ version: 'v0.9', updateComponents: { surfaceId: 'question', components: [card] } }));
  }
  assert.equal(props(c).disabled.value, false); c.dispose();
});

test('exported agent configuration cannot mutate SDK schemas or subsequent exports', async () => {
  const { getAgentConfiguration } = await import('../src/a2ui/agent.js');
  const baseline = getAgentConfiguration(); const exported = getAgentConfiguration();
  exported.catalogSchema.title = 'mutated';
  exported.protocolSchema.$defs.CreateSurfaceMessage.required.push("mutated");
  exported.capabilities['v0.9']!.supportedCatalogIds = [];
  exported.examples.clarification.length = 0;
  assert.deepEqual(getAgentConfiguration(), baseline);
  assert.deepEqual(a2uiCatalog.catalogSchema, baseline.catalogSchema);
});

test('late action completion does not write into replaced state bindings', async () => {
  let release!: () => void;
  const c = createA2uiController(() => new Promise<void>(resolve => { release = resolve; }));
  questionMessages().forEach(message => c.processMessage(message));
  const p = props(c); p.selected.set('orders'); p.onSelect();
  c.processMessage({ version: 'v0.9', updateDataModel: { surfaceId: 'question', path: '/next',
    value: { selected: '', disabled: false, answered: false, error: '' } } });
  const message = questionMessages()[2]; assert.ok('updateComponents' in message);
  if ('updateComponents' in message) {
    const card = message.updateComponents.components[0];
    for (const field of ['selected', 'disabled', 'answered', 'error']) card[field] = { path: `/next/${field}` };
    card.onSelect.event.context.optionId = { path: '/next/selected' }; c.processMessage(message);
  }
  release(); await tick(); assert.equal(props(c).answered.value, false); assert.equal(props(c).disabled.value, false);
  const surface = c.getSnapshot()[0].surface;
  assert.equal(surface.dataModel.get('/answered'), false); c.dispose();
});
