import type { A2uiActionMessage, A2uiResponse, A2uiResponseOptions } from '../a2ui/index.js';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type Send = (
  body: { messages: ChatMessage[]; stream: boolean },
  callbacks: {
    onTextDelta: (delta: string) => void;
    onDone: () => void;
    onResponse: (assistantContent: string) => void;
    onError: (error: Error) => void;
  },
) => { accepted: Promise<void>; cancel: () => void };

// Внешний адаптер примера. Не входит в переносимый модуль и не реализует HTTP.
export function sendChatRequest(options: {
  send: Send; messages: ChatMessage[]; stream: boolean; input: string | A2uiActionMessage;
  beginResponse: (options: A2uiResponseOptions) => A2uiResponse;
  onText: (delta: string) => void; onError: (error: Error) => void;
  onMessagesChange: (messages: ChatMessage[]) => void;
}) {
  const content = typeof options.input === 'string' ? options.input : JSON.stringify(options.input);
  const messages: ChatMessage[] = [...options.messages, { role: 'user', content }];
  const response = options.beginResponse({ onText: options.onText, onError: options.onError });
  let status: 'active' | 'done' | 'failed' | 'cancelled' = 'active';
  let raw = '';
  let cancelTransport: (() => void) | undefined;
  let resolve!: () => void; let reject!: (error: Error) => void;
  const accepted = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  const asError = (error: unknown) => error instanceof Error ? error : new Error('Не удалось отправить запрос', { cause: error });
  const cancelResponse = () => {
    try { response.cancel(); }
    finally { cancelTransport?.(); }
  };
  const fail = (error: Error) => {
    if (status !== 'active') return;
    status = 'failed'; reject(error);
    try { cancelResponse(); }
    finally { options.onError(error); }
  };
  const receive = (callback: () => void) => {
    if (status !== 'active') return;
    try { callback(); }
    catch (error) { fail(asError(error)); }
  };
  const finish = () => {
    response.finish();
    if (status !== 'active') return;
    // В истории сохраняется весь ответ с A2UI, видимый текст идёт отдельно.
    options.onMessagesChange([...messages, { role: 'assistant', content: raw }]);
    if (status !== 'active') return;
    status = 'done';
    resolve(); // Полный ответ также подтверждает принятие запроса.
  };
  try {
    options.onMessagesChange(messages);
    const request = options.send({ messages, stream: options.stream }, {
      onTextDelta(delta) {
        if (options.stream) receive(() => { raw += delta; response.push(delta); });
      },
      onDone() { if (options.stream) receive(finish); },
      onResponse(content) {
        if (!options.stream) receive(() => {
          raw = content; response.push(content);
          if (status === 'active') finish();
        });
      },
      onError: fail,
    });
    cancelTransport = () => request.cancel();
    if (status !== 'active' && status !== 'done') cancelTransport();
    // Callback onError и rejected accepted имеют одинаковое поведение.
    void request.accepted.then(() => { if (status === 'active') resolve(); }, error => {
      fail(asError(error));
    });
  } catch (error) {
    fail(asError(error));
  }
  return {
    accepted,
    cancel() {
      if (status !== 'active') return;
      status = 'cancelled';
      const error = new Error('Запрос отменён'); error.name = 'AbortError'; reject(error);
      cancelResponse();
    },
  };
}
