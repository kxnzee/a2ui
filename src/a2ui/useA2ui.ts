import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createA2uiProcessor, PROTOCOL_VERSION, type A2uiCatalog, type ActionHandler } from './processor.js';
import { A2uiError } from './errors.js';
import { createA2uiStream, type StreamOptions } from './stream.js';

export type A2uiResponseOptions = Pick<StreamOptions, 'onText' | 'onError'>;
export type A2uiResponse = {
  push: (delta: string) => void;
  finish: () => void;
  cancel: () => void;
};

// Предел одновременных поверхностей по умолчанию: блок ограничен по размеру, а их число — нет.
const DEFAULT_MAX_SURFACES = 10;

const asError = (cause: unknown) => cause instanceof A2uiError ? cause : new A2uiError(
  'action-failed', cause instanceof Error ? cause.message : 'Ошибка обработчика действия A2UI', { cause });
const defaultActionError = (error: A2uiError) => console.error(error);

// Только A2UI: нет запроса, состояния чата, истории сообщений или транспорта.
export function useA2ui({
  catalogs, onAction, onActionError = defaultActionError,
  framing, maxBlockLength, maxSurfaces = DEFAULT_MAX_SURFACES,
}: {
  // Каталоги компонентов, доступные агенту. Читаются один раз при создании processor.
  catalogs: readonly A2uiCatalog[];
  onAction: ActionHandler;
  // Ошибка onAction (синхронная или отклонённый промис). Без него — console.error.
  onActionError?: (error: A2uiError) => void;
  // Параметры текстового декодера (см. StreamOptions); значения читаются на каждый ответ.
  framing?: StreamOptions['framing'];
  maxBlockLength?: number;
  // Предел одновременных поверхностей; Infinity отключает ограничение.
  maxSurfaces?: number;
}) {
  const actionRef = useRef(onAction);
  const actionErrorRef = useRef(onActionError);
  const framingRef = useRef(framing);
  const maxBlockRef = useRef(maxBlockLength);
  const maxSurfacesRef = useRef(maxSurfaces);
  useLayoutEffect(() => {
    actionRef.current = onAction; actionErrorRef.current = onActionError;
    framingRef.current = framing; maxBlockRef.current = maxBlockLength; maxSurfacesRef.current = maxSurfaces;
  });
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
  }, catalogs));

  const beginResponse = useCallback((options: A2uiResponseOptions): A2uiResponse => {
    if (!mounted.current) throw new A2uiError('disposed', 'A2UI уже отключён');
    active.current?.cancel();
    let ended = false;
    const decoder = createA2uiStream({
      ...options, framing: framingRef.current, maxBlockLength: maxBlockRef.current,
      onMessage: message => {
        if ('createSurface' in message && processor.model.surfacesMap.size >= maxSurfacesRef.current) {
          throw new A2uiError('too-many-surfaces', `Слишком много поверхностей A2UI (максимум ${maxSurfacesRef.current})`);
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
      processor.processMessages([{ version: PROTOCOL_VERSION, deleteSurface: { surfaceId } }]);
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

  return useMemo(() => ({ processor, beginResponse, clear }), [processor, beginResponse, clear]);
}
