import test from 'node:test';
import assert from 'node:assert/strict';
import { createA2uiStream } from '../src/a2ui/stream.js';
const clarification = { type: 'clarification', props: { questionId: 'q1', question: 'Что показать?', options: [{ id: 'a', label: 'Выручка' }, { id: 'b', label: 'Заказы' }] } };
const metric = { type: 'metric', props: { title: 'Выручка', value: 1250000, unit: '₽' } };
const block = (value: unknown) => `<ui>${JSON.stringify(value)}</ui>`;
test('every split boundary preserves text and validates both component types', () => {
  const source = `До${block(clarification)}Между${block(metric)}После`;
  for (let split = 0; split <= source.length; split++) {
    const texts: string[] = []; const cards: unknown[] = [];
    const stream = createA2uiStream({ onText: t => texts.push(t), onComponent: q => cards.push(q), onError: e => { throw e; } });
    stream.push(source.slice(0, split)); stream.push(source.slice(split)); stream.finish();
    assert.equal(texts.join(''), 'ДоМеждуПосле'); assert.deepEqual(cards, [clarification, metric]);
  }
});
test('character deltas produce no premature card', () => {
  const cards: unknown[] = [];
  const s = createA2uiStream({ onText() {}, onComponent: q => cards.push(q) });
  for (const char of block(metric).slice(0, -1)) s.push(char);
  assert.equal(cards.length, 0); s.push('>'); s.finish(); assert.deepEqual(cards, [metric]);
});
test('invalid JSON, types, props, duplicate options, oversized and incomplete blocks are rejected', () => {
  const invalidValues = [
    { ...metric, type: 'chart' }, { ...metric, extra: true },
    { type: 'metric', props: { ...metric.props, value: '123' } },
    { type: 'metric', props: { ...metric.props, value: null } },
    { type: 'metric', props: { ...metric.props, unit: 'x'.repeat(25) } },
    { type: 'metric', props: { ...metric.props, extra: true } },
    { type: 'clarification', props: { ...clarification.props, options: [clarification.props.options[0], clarification.props.options[0]] } },
  ];
  for (const invalid of ['{', ...invalidValues.map(v => JSON.stringify(v)), 'x'.repeat(33000)]) {
    const errors: Error[] = []; const cards: unknown[] = [];
    const s = createA2uiStream({ onText() {}, onComponent: q => cards.push(q), onError: e => errors.push(e) });
    s.push(`<ui>${invalid}</ui>`); s.finish(); assert.equal(cards.length, 0); assert.equal(errors.length, 1);
  }
  const errors: Error[] = [];
  const s = createA2uiStream({ onText() {}, onComponent() {}, onError: e => errors.push(e) });
  s.push('<ui>{'); s.finish(); s.finish(); assert.equal(errors.length, 1);
});
test('cancel suppresses partial output; partial opening tag is ordinary text on finish', () => {
  let text = '';
  const s = createA2uiStream({ onText: t => text += t, onComponent() {} });
  s.push('<u'); s.cancel(); s.finish(); assert.equal(text, ''); assert.throws(() => s.push(block(metric)));
  const other = createA2uiStream({ onText: t => text += t, onComponent() {} });
  other.push('<u'); other.finish(); assert.equal(text, '<u');
});
