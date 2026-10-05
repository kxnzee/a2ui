import { useEffect, useRef, useState } from 'react';
import { A2uiView, useA2ui, type A2uiActionMessage } from '../a2ui/index.js';
import { sendChatRequest, type ChatMessage, type Send } from './request.js';

// Только пример чата. Для переноса нужен лишь каталог src/a2ui.
export function AgentChat({ send, messages, onMessagesChange, stream = true }: {
  send: Send; messages: ChatMessage[]; onMessagesChange: (messages: ChatMessage[]) => void; stream?: boolean;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const cancelRequest = useRef<(() => void) | undefined>(undefined);
  const requestRef = useRef<(input: string | A2uiActionMessage) => Promise<void>>(async () => {});
  const a2ui = useA2ui({ onAction: message => requestRef.current(message) });

  requestRef.current = input => {
    cancelRequest.current?.();
    setText(''); setError('');
    const request = sendChatRequest({
      send, messages, stream, input, beginResponse: a2ui.beginResponse,
      onText: delta => setText(t => t + delta),
      onError: e => setError(e.message), onMessagesChange,
    });
    cancelRequest.current = request.cancel;
    return request.accepted;
  };
  useEffect(() => () => cancelRequest.current?.(), []);

  async function start() {
    a2ui.clear();
    try { await requestRef.current('Покажи график с цифрами'); }
    catch (e) {
      // Отмена старого запроса не должна менять ошибку нового запроса.
      if (!(e instanceof Error && e.name === 'AbortError')) setError('Не удалось отправить запрос');
    }
  }
  return <>
    <button onClick={start}>Запросить график</button>
    <p style={{ whiteSpace: 'pre-wrap' }}>{text}</p>
    {error && <p role="alert">{error}</p>}
    <A2uiView controller={a2ui.controller} />
  </>;
}
