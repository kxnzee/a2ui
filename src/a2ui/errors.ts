// Стабильные коды ошибок: приложение выбирает по ним свой текст и язык,
// message — запасной русский текст по умолчанию.
export type A2uiErrorCode =
  | 'block-too-large' // блок длиннее maxBlockLength, отброшен
  | 'invalid-block' // JSON блока или конверт сообщения некорректны
  | 'message-rejected' // SDK не принял сообщение (причина в cause)
  | 'unterminated-block' // стрим закончился до закрывающего тега
  | 'stream-ended' // push после finish/cancel
  | 'too-many-surfaces' // превышен maxSurfaces
  | 'unknown-catalog' // createSurface с каталогом, который не подключён (рассинхрон агента и фронта)
  | 'action-failed' // onAction завершился ошибкой
  | 'disposed'; // хук уже размонтирован

export class A2uiError extends Error {
  constructor(readonly code: A2uiErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'A2uiError';
  }
}
