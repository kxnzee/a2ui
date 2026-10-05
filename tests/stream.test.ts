import test from 'node:test';
import assert from 'node:assert/strict';
import { createClarificationStream } from '../src/ui/stream.js';
const question = { questionId: 'q1', question: 'Что показать?', options: [{ id: 'a', label: 'Выручка' }, { id: 'b', label: 'Заказы' }] };
const block = `<clarification>${JSON.stringify(question)}</clarification>`;
test('every split boundary preserves text and produces exactly one complete card', () => {
  const source = `До${block}После`;
  for (let split = 0; split <= source.length; split++) {
    const texts: string[] = []; const cards: unknown[] = [];
    const stream = createClarificationStream({ onText: t => texts.push(t), onClarification: q => cards.push(q), onError: e => { throw e; } });
    stream.push(source.slice(0, split)); stream.push(source.slice(split)); stream.finish();
    assert.equal(texts.join(''), 'ДоПосле'); assert.deepEqual(cards, [question]);
  }
});
test('character deltas, multiple blocks and no premature card', () => {
  const cards: unknown[] = [];
  const s = createClarificationStream({ onText() {}, onClarification: q => cards.push(q) });
  for (const char of block.slice(0, -1)) s.push(char);
  assert.equal(cards.length, 0); s.push('>'); s.push(block); s.finish();
  assert.equal(cards.length, 2);
});
test('invalid JSON, unknown fields, duplicate options, oversized and incomplete blocks are rejected', () => {
  for (const invalid of ['{', JSON.stringify({ ...question, extra: true }), JSON.stringify({ ...question, options: [question.options[0], question.options[0]] }), 'x'.repeat(33000)]) {
    const errors: Error[] = []; const cards: unknown[] = [];
    const s = createClarificationStream({ onText() {}, onClarification: q => cards.push(q), onError: e => errors.push(e) });
    s.push(`<clarification>${invalid}</clarification>`); s.finish();
    assert.equal(cards.length, 0); assert.equal(errors.length, 1);
  }
  const errors: Error[] = [];
  const s = createClarificationStream({ onText() {}, onClarification() {}, onError: e => errors.push(e) });
  s.push('<clarification>{'); s.finish(); s.finish(); assert.equal(errors.length, 1);
});
test('cancel suppresses partial output; partial opening tag is ordinary text on finish', () => {
  let text = ''; let count = 0;
  const s = createClarificationStream({ onText: t => text += t, onClarification: () => count++ });
  s.push('<clarif'); s.cancel(); s.finish(); assert.equal(text, ''); assert.equal(count, 0);
  assert.throws(() => s.push(block));
  const other = createClarificationStream({ onText: t => text += t, onClarification() {} });
  other.push('<clarif'); other.finish(); assert.equal(text, '<clarif');
});
