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
  const fail = (error: Error) => {
    if (status !== 'active') return;
    status = 'failed'; response.cancel(); reject(error);
    cancelTransport?.(); options.onError(error);
  };
  const finish = () => {
    if (status !== 'active') return;
    status = 'done'; response.finish();
    // В истории сохраняется весь ответ с A2UI, видимый текст идёт отдельно.
    options.onMessagesChange([...messages, { role: 'assistant', content: raw }]);
    resolve(); // Полный ответ также подтверждает принятие запроса.
  };
  try {
    options.onMessagesChange(messages);
    const request = options.send({ messages, stream: options.stream }, {
      onTextDelta(delta) {
        if (status !== 'active' || !options.stream) return;
        raw += delta; response.push(delta);
      },
      onDone() { if (options.stream) finish(); },
      onResponse(content) {
        if (status !== 'active' || options.stream) return;
        raw = content; response.push(content); finish();
      },
      onError: fail,
    });
    cancelTransport = () => request.cancel();
    if (status !== 'active' && status !== 'done') cancelTransport();
    // Callback onError и rejected accepted имеют одинаковое поведение.
    void request.accepted.then(() => { if (status === 'active') resolve(); }, error => {
      fail(error instanceof Error ? error : new Error('Не удалось отправить запрос'));
    });
  } catch (error) {
    fail(error instanceof Error ? error : new Error('Не удалось отправить запрос'));
  }
  return {
    accepted,
    cancel() {
      if (status !== 'active') return;
      status = 'cancelled'; response.cancel();
      const error = new Error('Запрос отменён'); error.name = 'AbortError'; reject(error);
      cancelTransport?.();
    },
  };
}
