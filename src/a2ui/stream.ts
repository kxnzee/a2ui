import { A2uiMessageSchema, type A2uiMessage } from '@a2ui/web_core/v0_9';

const OPEN = '<a2ui>';
const CLOSE = '</a2ui>';
const MAX_BLOCK_LENGTH = 32_768;

// Ищет закрывающий тег вне строковых литералов JSON, чтобы `</a2ui>` внутри
// значения (например, в тексте вопроса) не обрывал блок.
function findClose(text: string) {
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (char === '\\') i++;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === '<' && text.startsWith(CLOSE, i)) return i;
  }
  return -1;
}

export type StreamOptions = {
  onText: (delta: string) => void;
  onMessage: (message: A2uiMessage) => void;
  onError?: (error: Error) => void;
};

// Принимает уже декодированные текстовые чанки от существующего транспорта.
export function createA2uiStream(options: StreamOptions) {
  let buffer = '';
  let inside = false;
  let ended = false;
  let skipping = false; // слишком большой блок: пропускаем до закрывающего тега
  // Состояние строк JSON при пропуске: блок приходит чанками, а тег внутри
  // значения не должен считаться его концом.
  let skipString = false;
  let skipEscaped = false;

  const emitText = (text: string) => { if (text) options.onText(text); };
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
      } else if (char === '"') skipString = true;
      else if (char === '<' && buffer.startsWith(CLOSE, i)) {
        buffer = buffer.slice(i + CLOSE.length);
        return true;
      } else if (char === '<' && CLOSE.startsWith(buffer.slice(i))) {
        buffer = buffer.slice(i); // возможное начало закрывающего тега в следующем чанке
        return false;
      }
    }
    buffer = '';
    return false;
  };

  return {
    push(delta: string) {
      if (ended) throw new Error('Стрим уже завершён');
      buffer += delta;
      while (!ended && buffer) {
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
          continue;
        }
        let end = findClose(buffer);
        // Кавычка без пары в битом JSON скрывает закрывающий тег. Если дальше уже
        // есть следующий блок, считаем границей первый тег: блок будет отклонён
        // как некорректный, а текст и последующие блоки сохранятся.
        if (end < 0) {
          const plain = buffer.indexOf(CLOSE);
          if (plain >= 0 && buffer.indexOf(OPEN, plain) >= 0) end = plain;
        }
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
    },

    finish() {
      if (ended) return;
      ended = true;
      const tail = buffer;
      buffer = '';
      if (!inside) emitText(tail);
      else if (!skipping) {
        // Закрывающий тег мог остаться скрытым за кавычкой без пары: сохраняем текст после него.
        const plain = tail.indexOf(CLOSE);
        if (plain >= 0) {
          reportError(new Error('Некорректный UI-блок: проверьте JSON и схему'));
          emitText(tail.slice(plain + CLOSE.length));
        } else reportError(new Error('Стрим закончился до закрытия UI-блока'));
      }
    },

    cancel() {
      ended = true;
      buffer = '';
    },
  };
}
