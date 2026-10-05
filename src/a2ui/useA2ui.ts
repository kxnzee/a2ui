import { useCallback, useEffect, useMemo, useRef } from 'react';
import { createA2uiController, type ActionHandler } from './controller.js';
import { createA2uiStream, type StreamOptions } from './stream.js';

export type A2uiResponseOptions = Pick<StreamOptions, 'onText' | 'onError'>;
export type A2uiResponse = {
  push: (delta: string) => void;
  finish: () => void;
  cancel: () => void;
};

// Только A2UI: нет запроса, состояния чата, истории сообщений или транспорта.
export function useA2ui({ onAction }: { onAction: ActionHandler }) {
  const answerRef = useRef(onAction);
  answerRef.current = onAction;
  const mounted = useRef(true);
  const active = useRef<A2uiResponse | undefined>(undefined);
  const controller = useMemo(
    () => createA2uiController(answer => answerRef.current(answer)), [],
  );

  const beginResponse = useCallback((options: A2uiResponseOptions): A2uiResponse => {
    if (!mounted.current) throw new Error('A2UI уже отключён');
    active.current?.cancel();
    let ended = false;
    const decoder = createA2uiStream({
      ...options,
      onMessage: message => controller.processMessage(message),
    });
    const response: A2uiResponse = {
      push(delta) { if (!ended) decoder.push(delta); },
      finish() {
        if (ended) return;
        ended = true;
        decoder.finish();
        if (active.current === response) active.current = undefined;
      },
      cancel() {
        ended = true;
        decoder.cancel();
        if (active.current === response) active.current = undefined;
      },
    };
    active.current = response;
    return response;
  }, [controller]);

  const clear = useCallback(() => {
    active.current?.cancel();
    controller.clear();
  }, [controller]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.cancel();
      // StrictMode повторяет setup/cleanup эффекта. Закрываем контроллер
      // только если за cleanup не последовал повторный setup.
      queueMicrotask(() => { if (!mounted.current) controller.dispose(); });
    };
  }, [controller]);

  return useMemo(() => ({ controller, beginResponse, clear }), [controller, beginResponse, clear]);
}
