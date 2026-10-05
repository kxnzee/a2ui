import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { NodeResolver, getValue, WritableBinding } from '@a2ui/web_core/v0_9';
import { createA2uiController } from '../src/a2ui/controller.js';
import { a2uiCatalog } from '../src/a2ui/catalog.js';
const q = { questionId: 'q1', question: 'Что показать?', options: [{ id: 'a', label: 'Выручка' }, { id: 'b', label: 'Заказы' }] };
const resolvers: NodeResolver[] = [];
afterEach(() => { for (const r of resolvers.splice(0)) r.dispose(); });
function props(c: ReturnType<typeof createA2uiController>) {
  const r = new NodeResolver(c.getSnapshot()!, a2uiCatalog);
  resolvers.push(r);
  const node = getValue(r.rootNode)!;
  return getValue(node.props) as unknown as { selected: WritableBinding<string>; disabled: WritableBinding<boolean>; answered: WritableBinding<boolean>; error: WritableBinding<string>; onSelect: () => void };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
test('actual A2UI action resolves selection, locks duplicate sends and marks success', async () => {
  const answers: unknown[] = []; let release!: () => void;
  const c = createA2uiController(a => { answers.push(a); return new Promise<void>(r => release = r); });
  c.showQuestion(q); const p = props(c);
  p.selected.set('a'); p.onSelect(); p.onSelect();
  assert.equal(answers.length, 1); assert.equal(props(c).disabled.value, true);
  release(); await tick();
  assert.deepEqual(answers[0], { type: 'clarification_answer', questionId: 'q1', optionId: 'a', label: 'Выручка' });
  assert.equal(props(c).answered.value, true); p.onSelect(); assert.equal(answers.length, 1); c.dispose();
});
test('failure allows retry; a new question replaces the surface', async () => {
  let attempts = 0;
  const c = createA2uiController(() => { if (++attempts === 1) throw new Error('offline'); });
  c.showQuestion(q); const original = c.getSnapshot(); const p = props(c);
  p.selected.set('b'); p.onSelect(); await tick();
  assert.equal(props(c).disabled.value, false); assert.ok(props(c).error.value);
  p.onSelect(); await tick(); assert.equal(props(c).answered.value, true);
  c.showQuestion(q); assert.equal(c.getSnapshot(), original);
  assert.throws(() => c.showQuestion({ ...q, question: 'changed' }));
  c.showQuestion({ ...q, questionId: 'q2' }); assert.notEqual(c.getSnapshot(), original);
  assert.equal(props(c).answered.value, false); c.dispose(); assert.equal(c.getSnapshot(), undefined);
});
test('late completion cannot mark a replacement question answered', async () => {
  let release!: () => void;
  const c = createA2uiController(() => new Promise<void>(r => release = r));
  c.showQuestion(q); const p = props(c); p.selected.set('a'); p.onSelect();
  c.showQuestion({ ...q, questionId: 'q2' }); release(); await tick();
  assert.equal(props(c).answered.value, false); c.dispose();
});

test('metric replaces clarification and invalid components preserve current surface', async () => {
  let release!: () => void;
  const c = createA2uiController(() => new Promise<void>(r => release = r));
  c.showQuestion(q); const p = props(c); p.selected.set('a'); p.onSelect();
  c.showComponent({ type: 'metric', props: { title: 'Заказы', value: 0 } });
  const surface = c.getSnapshot();
  const resolver = new NodeResolver(surface!, a2uiCatalog); resolvers.push(resolver);
  const node = getValue(resolver.rootNode)!;
  assert.equal(node.type, 'MetricCard');
  assert.equal((getValue(node.props) as Record<string, unknown>).value, 0);
  assert.equal(c.getQuestionId(), undefined);
  release(); await tick(); assert.equal(c.getSnapshot(), surface);
  assert.throws(() => c.showComponent({ type: 'unknown', props: {} }));
  assert.throws(() => c.showMetric({ title: 'Invalid', value: Infinity }));
  assert.equal(c.getSnapshot(), surface); c.dispose();
});
