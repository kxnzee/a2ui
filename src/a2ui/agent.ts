import { MessageProcessor, Schemas } from '@a2ui/web_core/v0_9';
import { a2uiCatalog, CATALOG_INSTRUCTIONS } from './catalog.js';

// web_core 0.11 экспортирует каталог через client capabilities.
export function getAgentConfiguration() {
  const processor = new MessageProcessor([a2uiCatalog]);
  try {
    const capabilities = processor.getClientCapabilities({ version: 'v0.9', includeInlineCatalogs: true });
    const catalogSchema = capabilities['v0.9']!.inlineCatalogs![0];
    for (const [name, component] of a2uiCatalog.components) {
      catalogSchema.components![name].description = component.schema.description;
    }
    delete capabilities['v0.9']!.inlineCatalogs; // Схема передаётся отдельно.
    return structuredClone({
      protocolVersion: 'v0.9',
      capabilities,
      catalogSchema,
      protocolSchema: Schemas.A2uiMessageSchemaRaw,
      instructions: `Используй стандартные сообщения A2UI v0.9: createSurface, updateComponents, updateDataModel, deleteSurface.
Компонент выбирается полем component в updateComponents. Свойства компонента находятся рядом с id и component, без props или type.
Сначала createSurface, затем данные и компоненты. Для новой поверхности новый surfaceId; для существующей — updateComponents/updateDataModel. Не повторяй createSurface для существующего ID.
Транспорт этого чата текстовый: помещай каждое полное JSON-сообщение в отдельный блок <a2ui>JSON</a2ui>. Обычный текст пиши вне блоков. Не включай </a2ui> в строки JSON. Теги не являются частью протокола A2UI.
${CATALOG_INSTRUCTIONS}`,
    });
  } finally {
    processor.model.dispose();
  }
}
