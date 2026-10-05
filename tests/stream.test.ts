import test from 'node:test';
import assert from 'node:assert/strict';
import { createA2uiStream } from '../src/a2ui/stream.js';
import { frame, questionMessages, metricMessages } from './fixtures.js';
const questions = questionMessages(); const metrics = metricMessages();
test('every boundary preserves text and passes standard messages unchanged', () => {
  const source = `До${frame(questions)}Между${frame(metrics)}После`;
  for (let split = 0; split <= source.length; split++) {
    const texts: string[] = []; const messages: unknown[] = [];
    const s = createA2uiStream({ onText: t => texts.push(t), onMessage: m => messages.push(m), onError: e => { throw e; } });
    s.push(source.slice(0, split)); s.push(source.slice(split)); s.finish();
    assert.equal(texts.join(''), 'ДоМеждуПосле'); assert.deepEqual(messages, [...questions, ...metrics]);
  }
});
test('character deltas produce no premature message', () => {
  const messages: unknown[] = []; const block = frame([metrics[0]]);
  const s = createA2uiStream({ onText() {}, onMessage: m => messages.push(m) });
  for (const char of block.slice(0, -1)) s.push(char);
  assert.equal(messages.length, 0); s.push('>'); s.finish(); assert.deepEqual(messages, [metrics[0]]);
});
test('invalid envelopes, JSON, large and incomplete frames are rejected', () => {
  for (const invalid of ['{', JSON.stringify({ type: 'metric', props: {} }), JSON.stringify({ ...metrics[0], extra: true }), 'x'.repeat(33000)]) {
    const errors: Error[] = []; const messages: unknown[] = [];
    const s = createA2uiStream({ onText() {}, onMessage: m => messages.push(m), onError: e => errors.push(e) });
    s.push(`<a2ui>${invalid}</a2ui>`); s.finish(); assert.equal(messages.length, 0); assert.equal(errors.length, 1);
  }
  const errors: Error[] = [];
  const s = createA2uiStream({ onText() {}, onMessage() {}, onError: e => errors.push(e) });
  s.push('<a2ui>{'); s.finish(); s.finish(); assert.equal(errors.length, 1);
});
test('cancel suppresses partial output; partial opening tag is text on finish', () => {
  let text = '';
  const s = createA2uiStream({ onText: t => text += t, onMessage() {} });
  s.push('<a2'); s.cancel(); s.finish(); assert.equal(text, ''); assert.throws(() => s.push(frame(metrics)));
  const other = createA2uiStream({ onText: t => text += t, onMessage() {} });
  other.push('<a2'); other.finish(); assert.equal(text, '<a2');
});

test('full assistant content from nonstreaming POST uses the same decoder', () => {
  let visible = ''; const messages: unknown[] = [];
  const s = createA2uiStream({ onText: t => visible += t, onMessage: m => messages.push(m) });
  s.push(`Готово. ${frame(metrics)}`); s.finish();
  assert.equal(visible, 'Готово. '); assert.deepEqual(messages, metrics);
});
