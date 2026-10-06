import { useCallback, useEffect, useMemo, useRef } from 'react';
import { createA2uiProcessor, type ActionHandler } from './processor.js';
import { createA2uiStream, type StreamOptions } from './stream.js';

export type A2uiResponseOptions = Pick<StreamOptions, 'onText' | 'onError'>;
export type A2uiResponse = {
  push: (delta: string) => void;
  finish: () => void;
  cancel: () => void;
};

// Только A2UI: нет запроса, состояния чата, истории сообщений или транспорта.
export function useA2ui({ onAction }: { onAction: ActionHandler }) {
  const actionRef = useRef(onAction);
  actionRef.current = onAction;
  const mounted = useRef(true);
  const active = useRef<A2uiResponse | undefined>(undefined);
  const processor = useMemo(
    () => createA2uiProcessor(message => {
      if (mounted.current) return actionRef.current(message);
    }), [],
  );

  const beginResponse = useCallback((options: A2uiResponseOptions): A2uiResponse => {
    if (!mounted.current) throw new Error('A2UI уже отключён');
    active.current?.cancel();
    let ended = false;
    const decoder = createA2uiStream({
      ...options,
      onMessage: message => processor.processMessages([message]),
    });
    const response: A2uiResponse = {
      push(delta) { if (!ended) decoder.push(delta); },
      finish() {
        if (ended) return;
        ended = true;
        try { decoder.finish(); }
        finally { if (active.current === response) active.current = undefined; }
      },
      cancel() {
        ended = true;
        decoder.cancel();
        if (active.current === response) active.current = undefined;
      },
    };
    active.current = response;
    return response;
  }, [processor]);

  const clear = useCallback(() => {
    active.current?.cancel();
    for (const surfaceId of processor.model.surfacesMap.keys()) {
      processor.processMessages([{ version: 'v0.9', deleteSurface: { surfaceId } }]);
    }
  }, [processor]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.cancel();
      // StrictMode повторяет setup/cleanup эффекта. Закрываем processor
      // только если за cleanup не последовал повторный setup.
      queueMicrotask(() => { if (!mounted.current) processor.model.dispose(); });
    };
  }, [processor]);

  return useMemo(() => ({ processor, beginResponse, clear }), [processor, beginResponse, clear]);
}
