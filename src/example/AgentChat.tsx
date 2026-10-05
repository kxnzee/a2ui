import { useEffect, useRef, useState } from 'react';
import { A2uiView, useA2ui, type ClarificationAnswer } from '../a2ui/index.js';

// Это интерфейс адаптера к вашему существующему запросу, не HTTP-клиент.
type Send = (
  input: string | ClarificationAnswer,
  callbacks: {
    onTextDelta: (delta: string) => void;
    onDone: () => void;
    onError: (error: Error) => void;
  },
) => { accepted: Promise<void>; cancel: () => void };

// Только пример чата. Для переноса нужен лишь каталог src/a2ui.
export function AgentChat({ send }: { send: Send }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const cancelRequest = useRef<(() => void) | undefined>(undefined);
  const requestRef = useRef<(input: string | ClarificationAnswer) => Promise<void>>(async () => {});
  const a2ui = useA2ui({ onAnswer: answer => requestRef.current(answer) });

  requestRef.current = async input => {
    cancelRequest.current?.();
    setText('');
    setError('');
    const response = a2ui.beginResponse({
      onText: delta => setText(t => t + delta), // Ваш существующий store сообщений.
      onError: e => setError(e.message),
    });
    let cancelled = false;
    try {
      const request = send(input, {
        onTextDelta: response.push,
        onDone: response.finish,
        onError: e => {
          response.cancel();
          if (!cancelled) setError(e.message);
        },
      });
      cancelRequest.current = () => {
        cancelled = true;
        response.cancel();
        request.cancel(); // Транспорт отменяет приложение, не A2UI.
      };
      await request.accepted;
    } catch (error) {
      response.cancel();
      throw error; // Карточка покажет ошибку и позволит повторить выбор.
    }
  };

  useEffect(() => () => cancelRequest.current?.(), []);

  async function start() {
    a2ui.clear();
    try { await requestRef.current('Покажи график с цифрами'); }
    catch { setError('Не удалось отправить запрос'); }
  }

  return <>
    <button onClick={start}>Запросить график</button>
    <p style={{ whiteSpace: 'pre-wrap' }}>{text}</p>
    {error && <p role="alert">{error}</p>}
    <A2uiView controller={a2ui.controller} />
  </>;
}
