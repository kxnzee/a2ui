import { useEffect, useRef, useState } from 'react';
import { A2uiView, useA2ui, type A2uiActionMessage } from '../a2ui/index.js';
import { cards } from '../a2ui/cards.js';
import { sendChatRequest, type ChatMessage, type Send } from './request.js';

// Только пример чата. Для переноса нужен лишь каталог src/a2ui.
export function AgentChat({ send, messages, onMessagesChange, stream = true }: {
  send: Send; messages: ChatMessage[]; onMessagesChange: (messages: ChatMessage[]) => void; stream?: boolean;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const cancelRequest = useRef<(() => void) | undefined>(undefined);
  const requestRef = useRef<(input: string | A2uiActionMessage) => Promise<void>>(async () => {});
  const a2ui = useA2ui({ catalogs: [cards.catalog], onAction: message => requestRef.current(message) });

  requestRef.current = input => {
    cancelRequest.current?.();
    setText(''); setError('');
    const request = sendChatRequest({
      send, messages, stream, input, beginResponse: a2ui.beginResponse,
      onText: delta => setText(t => t + delta),
      onError: e => {
        setError(e.message);
        // Карточка заблокирована после клика: разрешаем повторить выбор.
        if (typeof input !== 'string') a2ui.reopen(input.action.surfaceId);
      },
      onMessagesChange,
    });
    cancelRequest.current = request.cancel;
    // Ошибка уже показана через onError. SDK не должен повторно её логировать,
    // а поздний catch старого запроса — перезаписывать состояние нового.
    return request.accepted.catch(() => {});
  };
  useEffect(() => () => cancelRequest.current?.(), []);

  function start() {
    a2ui.clear();
    void requestRef.current('Покажи график с цифрами');
  }
  return <>
    <button onClick={start}>Запросить график</button>
    <p style={{ whiteSpace: 'pre-wrap' }}>{text}</p>
    {error && <p role="alert">{error}</p>}
    <A2uiView processor={a2ui.processor} />
  </>;
}
