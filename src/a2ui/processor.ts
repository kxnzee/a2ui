import { MessageProcessor, STRICT_VALIDATION, type A2uiClientMessage } from '@a2ui/web_core/v0_9';
import type { ReactComponentImplementation } from '@a2ui/react/v0_9';
import { a2uiCatalog } from './catalog.js';

export type A2uiActionMessage = Extract<A2uiClientMessage, { action: unknown }>;
export type ActionHandler = (message: A2uiActionMessage) => void | Promise<void>;
export type A2uiProcessor = MessageProcessor<ReactComponentImplementation>;

// Возвращаем сам SDK, без собственного контроллера, store и логики карточек.
export function createA2uiProcessor(onAction: ActionHandler): A2uiProcessor {
  return new MessageProcessor([a2uiCatalog], action => onAction({ version: 'v0.9', action }), {
    version: 'v0.9', validationConfig: { ...STRICT_VALIDATION, targetVersion: 'v0.9' },
  });
}
