import test from 'node:test';
import assert from 'node:assert/strict';
import { sendChatRequest, type Send, type ChatMessage } from '../src/example/request.js';
import { createA2uiStream } from '../src/a2ui/stream.js';
import { frame, metricMessages } from './fixtures.js';

function harness(stream = true, override?: Send) {
  let callbacks!: Parameters<Send>[1];
  let body!: Parameters<Send>[0];
  let rejectTransport!: (error: Error) => void;
  let cancelled = 0;
  const history: ChatMessage[][] = []; const errors: Error[] = []; const chunks: string[] = []; const ui: unknown[] = [];
  const original: ChatMessage[] = [{ role: 'system', content: 'instructions' }];
  const send: Send = override ?? ((b, c) => {
    body = b; callbacks = c;
    const request = { accepted: new Promise<void>((_, no) => { rejectTransport = no; }), cancel() {
      assert.equal(this, request); cancelled++;
    } };
    return request;
  });
  const request = sendChatRequest({ send, messages: original, stream, input: 'Покажи цифру',
    beginResponse: options => createA2uiStream({ ...options, onMessage: message => ui.push(message) }),
    onText: text => chunks.push(text), onError: error => errors.push(error), onMessagesChange: messages => history.push(messages),
  });
  return { request, original, history, errors, chunks, ui, callbacks: () => callbacks, body: () => body,
    rejectTransport: (error: Error) => rejectTransport(error), cancelled: () => cancelled };
}

for (const stream of [true, false]) test(`chat adapter preserves raw A2UI in history (${stream ? 'stream' : 'POST'})`, async () => {
  const h = harness(stream); const content = `Результат: ${frame(metricMessages())} Готово`;
  if (stream) {
    for (const char of content) h.callbacks().onTextDelta(char);
    h.callbacks().onResponse(content); // Another mode's callback must not duplicate data.
    h.callbacks().onDone();
  } else {
    h.callbacks().onTextDelta('ignored'); h.callbacks().onDone();
    assert.equal(h.history.length, 1);
    h.callbacks().onResponse(content);
  }
  await h.request.accepted;
  h.callbacks().onDone(); h.callbacks().onTextDelta('late'); h.callbacks().onError(new Error('late'));
  assert.equal(h.history.length, 2);
  assert.equal(h.history[1].at(-1)!.content, content);
  assert.equal(h.chunks.join(''), 'Результат:  Готово');
  assert.equal(h.ui.length, metricMessages().length); assert.equal(h.errors.length, 0);
  assert.equal(h.body().stream, stream); assert.equal(h.body().messages.length, 2);
  assert.equal(h.original.length, 1);
});

test('callback error rejects acceptance, cancels transport and ignores late callbacks', async () => {
  const h = harness(); const rejected = assert.rejects(h.request.accepted, /offline/);
  h.callbacks().onError(new Error('offline')); await rejected;
  h.callbacks().onTextDelta('late'); h.callbacks().onDone();
  h.rejectTransport(new Error('duplicate')); await Promise.resolve();
  assert.equal(h.cancelled(), 1); assert.equal(h.errors.length, 1); assert.equal(h.history.length, 1);
  assert.equal(h.chunks.length, 0);
});

test('cancellation rejects with AbortError without reporting errors into a new request', async () => {
  const h = harness(); const rejected = assert.rejects(h.request.accepted, { name: 'AbortError' });
  h.request.cancel(); h.request.cancel(); await rejected;
  h.callbacks().onError(new Error('late')); h.callbacks().onDone();
  assert.equal(h.cancelled(), 1); assert.equal(h.errors.length, 0); assert.equal(h.history.length, 1);
});

test('transport rejection and synchronous throw use the same error path', async () => {
  const h = harness(); const rejected = assert.rejects(h.request.accepted, /rejected/);
  h.rejectTransport(new Error('rejected')); await rejected;
  assert.equal(h.errors.length, 1); assert.equal(h.cancelled(), 1);
  const sync = harness(true, () => { throw new Error('sync'); });
  await assert.rejects(sync.request.accepted, /sync/); assert.equal(sync.errors.length, 1);
});

test('synchronous error callback still cancels the subsequently returned transport', async () => {
  let cancelled = 0;
  const h = harness(true, (_, callbacks) => {
    callbacks.onError(new Error('sync callback'));
    return { accepted: Promise.resolve(), cancel: () => { cancelled++; } };
  });
  await assert.rejects(h.request.accepted, /sync callback/); assert.equal(cancelled, 1);
});
