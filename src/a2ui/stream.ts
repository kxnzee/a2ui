import { A2uiMessageSchema, type A2uiMessage } from '@a2ui/web_core/v0_9';

const OPEN = '<a2ui>';
const CLOSE = '</a2ui>';
const MAX_BLOCK_LENGTH = 32_768;

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

  const emitText = (text: string) => { if (text) options.onText(text); };
  const reportError = (error: Error) => {
    if (options.onError) options.onError(error);
    else throw error;
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

        const end = buffer.indexOf(CLOSE);
        if (skipping) {
          if (end < 0) { buffer = buffer.slice(-(CLOSE.length - 1)); break; }
          buffer = buffer.slice(end + CLOSE.length);
          inside = skipping = false;
          continue;
        }
        if ((end < 0 && buffer.length > MAX_BLOCK_LENGTH + CLOSE.length) ||
            end > MAX_BLOCK_LENGTH) {
          // Отбрасываем блок целиком, текст после него сохраняется.
          skipping = true;
          buffer = end < 0 ? buffer.slice(-(CLOSE.length - 1)) : buffer;
          reportError(new Error('UI-блок слишком большой'));
          continue;
        }
        if (end < 0) break;

        const json = buffer.slice(0, end);
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
      if (inside) { if (!skipping) reportError(new Error('Стрим закончился до закрытия UI-блока')); }
      else emitText(tail);
    },

    cancel() {
      ended = true;
      buffer = '';
    },
  };
}
