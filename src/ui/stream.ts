import { ClarificationSchema, type Clarification } from './contract.js';

const OPEN = '<clarification>';
const CLOSE = '</clarification>';
const MAX_BLOCK_LENGTH = 32_768;

export type StreamOptions = {
  onText: (delta: string) => void;
  onClarification: (question: Clarification) => void;
  onError?: (error: Error) => void;
};

// Принимает уже декодированные текстовые чанки от существующего транспорта.
export function createClarificationStream(options: StreamOptions) {
  let buffer = '';
  let inside = false;
  let ended = false;
  let failed = false;

  const emitText = (text: string) => { if (text) options.onText(text); };
  const fail = (message: string) => {
    options.onError?.(new Error(message));
  };

  return {
    push(delta: string) {
      if (ended) throw new Error('Стрим уже завершён');
      if (failed) return;
      buffer += delta;
      while (buffer) {
        if (!inside) {
          const start = buffer.indexOf(OPEN);
          if (start >= 0) {
            emitText(buffer.slice(0, start));
            buffer = buffer.slice(start + OPEN.length);
            inside = true;
            continue;
          }
          // Сохраняем только возможный незавершённый открывающий тег.
          let keep = Math.min(buffer.length, OPEN.length - 1);
          while (keep > 0 && !OPEN.startsWith(buffer.slice(-keep))) keep--;
          emitText(buffer.slice(0, buffer.length - keep));
          buffer = keep ? buffer.slice(-keep) : '';
          break;
        }

        const end = buffer.indexOf(CLOSE);
        if ((end < 0 && buffer.length > MAX_BLOCK_LENGTH + CLOSE.length) ||
            end > MAX_BLOCK_LENGTH) {
          failed = true;
          buffer = '';
          fail('Блок уточнения слишком большой');
          break;
        }
        if (end < 0) break;

        const json = buffer.slice(0, end);
        buffer = buffer.slice(end + CLOSE.length);
        inside = false;
        try {
          const question = ClarificationSchema.parse(JSON.parse(json));
          options.onClarification(question);
        } catch {
          fail('Некорректный блок уточнения: проверьте JSON и схему');
        }
      }
    },

    finish() {
      if (ended) return;
      ended = true;
      if (failed) return;
      if (inside) fail('Стрим закончился до закрытия блока уточнения');
      else emitText(buffer);
      buffer = '';
    },

    cancel() {
      ended = true;
      buffer = '';
    },
  };
}
