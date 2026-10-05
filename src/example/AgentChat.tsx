import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ClarificationSurface,
  createClarificationController,
  createClarificationStream,
  type ClarificationAnswer,
} from '../ui/index.js';
// При копировании исходников: import ... from './ui/index';

type Send = (
  input: string | ClarificationAnswer,
  callbacks: {
    onTextDelta: (delta: string) => void;
    onDone: () => void;
    onError: (error: Error) => void;
  },
) => { accepted: Promise<void>; cancel: () => void };

export function AgentChat({ send }: { send: Send }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const sendRef = useRef(send);
  sendRef.current = send;
  const active = useRef<(() => void) | undefined>(undefined);
  const mounted = useRef(true);
  const requestRef = useRef<(input: string | ClarificationAnswer) => Promise<void>>(
    async () => {},
  );
  const controller = useMemo(
    () => createClarificationController(answer => requestRef.current(answer)),
    [],
  );

  requestRef.current = async input => {
    active.current?.();
    setText('');
    setError('');
    // Новый декодер на каждый ответ агента, один контроллер на диалог.
    const stream = createClarificationStream({
      onText: delta => { if (mounted.current) setText(t => t + delta); },
      onClarification: question => controller.showQuestion(question),
      onError: e => { if (mounted.current) setError(e.message); },
    });
    let cancelled = false;
    const request = sendRef.current(input, {
      onTextDelta: delta => { if (!cancelled) stream.push(delta); },
      onDone: () => { if (!cancelled) stream.finish(); },
      onError: e => {
        stream.cancel();
        cancelled = true;
        if (mounted.current) setError(e.message);
      },
    });
    active.current = () => {
      cancelled = true;
      stream.cancel();
      request.cancel();
    };
    await request.accepted; // rejected → карточка покажет ошибку и позволит повторить
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.();
      // React StrictMode повторяет setup/cleanup эффектов в dev.
      // Отложенное dispose выполняется только при реальном unmount.
      queueMicrotask(() => { if (!mounted.current) controller.dispose(); });
    };
  }, [controller]);

  async function start() {
    controller.clear();
    try { await requestRef.current('Покажи график с цифрами'); }
    catch { setError('Не удалось отправить запрос'); }
  }

  return <>
    <button onClick={start}>Запросить график</button>
    <p style={{ whiteSpace: 'pre-wrap' }}>{text}</p>
    {error && <p role="alert">{error}</p>}
    <ClarificationSurface controller={controller} />
  </>;
}
