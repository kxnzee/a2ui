import { MessageProcessor, type A2uiClientMessage, type Catalog } from '@a2ui/web_core/v0_9';
import type { ReactComponentImplementation } from '@a2ui/react/v0_9';

export const PROTOCOL_VERSION = 'v0.9' as const;
export type A2uiActionMessage = Extract<A2uiClientMessage, { action: unknown }>;
export type ActionHandler = (message: A2uiActionMessage) => void | Promise<void>;
export type A2uiProcessor = MessageProcessor<ReactComponentImplementation>;
export type A2uiCatalog = Catalog<ReactComponentImplementation>;
// Каталог и инструкции модели к нему: то, что нужно подключить для нового функционала.
export type A2uiCatalogKit = { catalog: A2uiCatalog; instructions: string };

// Возвращаем сам SDK, без собственного контроллера, store и логики компонентов.
// Каталоги передаёт приложение: модуль не знает конкретных компонентов.
export function createA2uiProcessor(
  onAction: ActionHandler, catalogs: readonly A2uiCatalog[],
): A2uiProcessor {
  return new MessageProcessor([...catalogs], action => onAction({ version: PROTOCOL_VERSION, action }), {
    version: PROTOCOL_VERSION,
  });
}
