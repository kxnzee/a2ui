import { MessageProcessor, Schemas } from '@a2ui/web_core/v0_9';
import { a2uiCatalog } from './catalog.js';

let cachedCapabilities: ReturnType<MessageProcessor['getRendererCapabilities']> | undefined;

export function getAgentConfiguration() {
  if (!cachedCapabilities) {
    const processor = new MessageProcessor([a2uiCatalog]);
    cachedCapabilities = processor.getRendererCapabilities({ versions: ['v0.9'], includeInlineCatalogs: false });
    processor.dispose();
  }
  return {
    protocolVersion: 'v0.9',
    capabilities: structuredClone(cachedCapabilities),
    catalogSchema: structuredClone(a2uiCatalog.catalogSchema),
    protocolSchema: structuredClone(Schemas.A2uiMessageSchemaRaw),
    instructions: `Используй стандартные сообщения A2UI v0.9: createSurface, updateComponents, updateDataModel, deleteSurface.
Компонент выбирается полем component в updateComponents. Свойства компонента находятся рядом с id и component, без props или type.
Сначала createSurface, затем данные и компоненты. Для новой поверхности новый surfaceId; для существующей — updateComponents/updateDataModel. Не повторяй createSurface для существующего ID.
Транспорт этого чата текстовый: помещай каждое полное JSON-сообщение в отдельный блок <a2ui>JSON</a2ui>. Обычный текст пиши вне блоков. Не включай </a2ui> в строки JSON. Теги не являются частью протокола A2UI.
${a2uiCatalog.instructions}`,
  };
}
