import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createA2uiProcessor, type ActionHandler } from './processor.js';
import { createA2uiStream, type StreamOptions } from './stream.js';

export type A2uiResponseOptions = Pick<StreamOptions, 'onText' | 'onError'>;
export type A2uiResponse = {
  push: (delta: string) => void;
  finish: () => void;
  cancel: () => void;
};

// Предел одновременных поверхностей: блок ограничен по размеру, но их число — нет.
const MAX_SURFACES = 10;

const asError = (cause: unknown) => cause instanceof Error ? cause : new Error('Ошибка обработчика действия A2UI', { cause });
const defaultActionError = (error: Error) => console.error(error);

// Только A2UI: нет запроса, состояния чата, истории сообщений или транспорта.
export function useA2ui({ onAction, onActionError = defaultActionError }: {
  onAction: ActionHandler;
  // Ошибка onAction (синхронная или отклонённый промис). Без него — console.error.
  onActionError?: (error: Error) => void;
}) {
  const actionRef = useRef(onAction);
  const actionErrorRef = useRef(onActionError);
  useLayoutEffect(() => { actionRef.current = onAction; actionErrorRef.current = onActionError; });
  const mounted = useRef(true);
  const active = useRef<A2uiResponse | undefined>(undefined);
  // useState, а не useMemo: React вправе выбросить мемоизированное значение,
  // и тогда processor с поверхностями пересоздался бы посреди работы.
  const [processor] = useState(() => createA2uiProcessor(message => {
    if (!mounted.current) return;
    // SDK не обрабатывает результат обработчика: отклонённый промис стал бы
    // unhandledrejection, поэтому перехватываем его сами.
    const report = (cause: unknown) => actionErrorRef.current(asError(cause));
    try { return Promise.resolve(actionRef.current(message)).catch(report); }
    catch (cause) { report(cause); }
  }));

  const beginResponse = useCallback((options: A2uiResponseOptions): A2uiResponse => {
    if (!mounted.current) throw new Error('A2UI уже отключён');
    active.current?.cancel();
    let ended = false;
    const decoder = createA2uiStream({
      ...options,
      onMessage: message => {
        if ('createSurface' in message && processor.model.surfacesMap.size >= MAX_SURFACES) {
          throw new Error(`Слишком много поверхностей A2UI (максимум ${MAX_SURFACES})`);
        }
        processor.processMessages([message]);
      },
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

  // Разрешает повторный выбор в карточках поверхности: сбрасывает привязанный
  // selected стандартным updateDataModel (например, после ошибки отправки).
  const reopen = useCallback((surfaceId: string) => {
    const surface = processor.model.getSurface(surfaceId);
    if (!surface) return;
    for (const [, component] of surface.componentsModel.entries) {
      const path = component.type === 'ClarificationCard' ? component.properties.selected?.path : undefined;
      if (typeof path === 'string') {
        processor.processMessages([{ version: 'v0.9', updateDataModel: { surfaceId, path, value: '' } }]);
      }
    }
  }, [processor]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.cancel();
      // processor намеренно не dispose: cleanup вызывают и StrictMode, и повторный
      // показ поддерева (например, Activity), а после dispose processor неработоспособен.
      // Отписываться нечего: processor никем не удерживается и будет собран GC.
    };
  }, [processor]);

  return useMemo(() => ({ processor, beginResponse, clear, reopen }), [processor, beginResponse, clear, reopen]);
}
