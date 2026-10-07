import { A2uiMessageSchema, type A2uiMessage } from '@a2ui/web_core/v0_9';

// Обрамление блока в смешанном текстовом потоке. Не часть протокола A2UI: транспорт,
// который отдаёт сообщения отдельно, обходится без декодера (processor.processMessages).
export const DEFAULT_FRAMING = { open: '<a2ui>', close: '</a2ui>' } as const;
export type Framing = { open: string; close: string };
const DEFAULT_MAX_BLOCK_LENGTH = 32_768;

// Ищет закрывающий тег вне строковых литералов JSON, чтобы `</a2ui>` внутри
// значения (например, в тексте вопроса) не обрывал блок.
function findClose(text: string, close: string) {
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (char === '\\') i++;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === close[0] && text.startsWith(close, i)) return i;
  }
  return -1;
}

export type StreamOptions = {
  // Теги блока, по умолчанию <a2ui>…</a2ui>.
  framing?: Framing;
  // Максимальная длина одного блока; больший блок отбрасывается целиком.
  maxBlockLength?: number;
  onText: (delta: string) => void;
  onMessage: (message: A2uiMessage) => void;
  onError?: (error: Error) => void;
};

// Принимает уже декодированные текстовые чанки от существующего транспорта.
export function createA2uiStream(options: StreamOptions) {
  const { open: OPEN, close: CLOSE } = options.framing ?? DEFAULT_FRAMING;
  const MAX_BLOCK_LENGTH = options.maxBlockLength ?? DEFAULT_MAX_BLOCK_LENGTH;
  const MAX_HELD_LENGTH = MAX_BLOCK_LENGTH * 8; // предел запасного буфера при пропуске большого блока
  let buffer = '';
  let inside = false;
  let ended = false; // finish или cancel: новые push запрещены
  let cancelled = false; // cancel, в том числе из callback: дальше ничего не выводим
  let skipping = false; // слишком большой блок: пропускаем до закрывающего тега
  // Состояние строк JSON при пропуске: блок приходит чанками, а тег внутри
  // значения не должен считаться его концом.
  let skipString = false;
  let skipEscaped = false;
  // Запасной вариант для битого JSON: текст после первого `</a2ui>` внутри строки.
  // Если честный конец блока так и не найден, в finish() разбираем его заново.
  let held: string | undefined;

  const emitText = (text: string) => { if (text && !cancelled) options.onText(text); };
  const reportError = (error: Error) => {
    if (options.onError) options.onError(error);
    else throw error;
  };

  // Продолжает пропуск блока по buffer; true — найден закрывающий тег вне строк.
  const skip = () => {
    for (let i = 0; i < buffer.length; i++) {
      const char = buffer[i];
      if (skipEscaped) skipEscaped = false;
      else if (skipString) {
        if (char === '\\') skipEscaped = true;
        else if (char === '"') skipString = false;
        else if (char === CLOSE[0] && held === undefined && buffer.startsWith(CLOSE, i)) {
          held = buffer.slice(i + CLOSE.length);
        }
      } else if (char === '"') skipString = true;
      else if (char === CLOSE[0] && buffer.startsWith(CLOSE, i)) {
        buffer = buffer.slice(i + CLOSE.length);
        return true;
      } else if (char === CLOSE[0] && CLOSE.startsWith(buffer.slice(i))) {
        buffer = buffer.slice(i); // возможное начало закрывающего тега в следующем чанке
        return false;
      }
    }
    buffer = '';
    return false;
  };

  const process = () => {
    while (!cancelled && buffer) {
      if (!inside) {
        const start = buffer.indexOf(OPEN);
        if (start >= 0) {
          const text = buffer.slice(0, start);
          buffer = buffer.slice(start + OPEN.length);
          inside = true;
          emitText(text);
          continue;
        }
        // Сохраняем только возможный незавершённый открывающий тег.
        let keep = Math.min(buffer.length, OPEN.length - 1);
        while (keep > 0 && !OPEN.startsWith(buffer.slice(-keep))) keep--;
        const text = buffer.slice(0, buffer.length - keep);
        buffer = keep ? buffer.slice(-keep) : '';
        emitText(text);
        break;
      }

      if (skipping) {
        if (!skip()) break;
        inside = skipping = false;
        held = undefined;
        continue;
      }
      const end = findClose(buffer, CLOSE);
      if ((end < 0 && buffer.length > MAX_BLOCK_LENGTH + CLOSE.length) ||
          end > MAX_BLOCK_LENGTH) {
        // Отбрасываем блок целиком, текст после него сохраняется.
        skipping = true;
        skipString = skipEscaped = false;
        reportError(new Error('UI-блок слишком большой'));
        continue;
      }
      if (end < 0) break;

      // Модели часто оборачивают JSON в markdown-ограду; снимаем её перед разбором.
      const json = buffer.slice(0, end).trim()
        .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      buffer = buffer.slice(end + CLOSE.length);
      inside = false;
      let message: A2uiMessage;
      try {
        message = A2uiMessageSchema.parse(JSON.parse(json));
      } catch (cause) {
        reportError(new Error('Некорректный UI-блок: проверьте JSON и схему', { cause }));
        continue;
      }
      try {
        options.onMessage(message);
      } catch (cause) {
        reportError(new Error('Не удалось обработать сообщение A2UI', { cause }));
      }
    }
  };

  return {
    push(delta: string) {
      if (ended) throw new Error('Стрим уже завершён');
      if (cancelled) return;
      if (skipping && held !== undefined) {
        held += delta;
        if (held.length > MAX_HELD_LENGTH) held = undefined;
      }
      buffer += delta;
      process();
    },

    finish() {
      if (ended) return;
      ended = true;
      // Честного конца блока нет. Это либо обрыв стрима, либо битый JSON с кавычкой
      // без пары, скрывшей закрывающий тег. Решаем только здесь, когда больше данных
      // не будет: на середине потока такой блок неотличим от ещё не завершённого,
      // а результат не должен зависеть от разбиения на чанки.
      while (!cancelled && inside) {
        if (skipping && held !== undefined) {
          buffer = held; // ошибка о размере уже передана
        } else if (!skipping && buffer.includes(CLOSE)) {
          const plain = buffer.indexOf(CLOSE);
          buffer = buffer.slice(plain + CLOSE.length);
          reportError(new Error('Некорректный UI-блок: проверьте JSON и схему'));
        } else {
          if (!skipping) reportError(new Error('Стрим закончился до закрытия UI-блока'));
          buffer = '';
          break;
        }
        inside = skipping = false;
        held = undefined;
        process();
      }
      const tail = buffer;
      buffer = '';
      if (!inside) emitText(tail);
    },

    cancel() {
      ended = cancelled = true;
      buffer = '';
    },
  };
}
