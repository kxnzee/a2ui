import { MessageProcessor, Schemas } from '@a2ui/web_core/v0_9';
import { PROTOCOL_VERSION, type A2uiCatalogKit } from './processor.js';
import { DEFAULT_FRAMING, type Framing } from './stream.js';

// Общая часть инструкции модели. Приложение может заменить её целиком (язык, формат).
export function defaultProtocolInstructions(framing: Framing = DEFAULT_FRAMING) {
  return `Используй стандартные сообщения A2UI ${PROTOCOL_VERSION}: createSurface, updateComponents, updateDataModel, deleteSurface.
Компонент выбирается полем component в updateComponents. Свойства компонента находятся рядом с id и component, без props или type.
Сначала createSurface, затем данные и компоненты. Для новой поверхности новый surfaceId; для существующей — updateComponents/updateDataModel. Не повторяй createSurface для существующего ID.
Транспорт этого чата текстовый: помещай каждое полное JSON-сообщение в отдельный блок ${framing.open}JSON${framing.close}. Обычный текст пиши вне блоков. Теги не являются частью протокола A2UI.`;
}

// web_core 0.11 экспортирует каталог через client capabilities.
export function getAgentConfiguration(
  { catalog, instructions }: A2uiCatalogKit,
  { framing = DEFAULT_FRAMING, protocolInstructions = defaultProtocolInstructions(framing) }: {
    framing?: Framing; protocolInstructions?: string;
  } = {},
) {
  const processor = new MessageProcessor([catalog]);
  try {
    const capabilities = processor.getClientCapabilities({ version: PROTOCOL_VERSION, includeInlineCatalogs: true });
    const catalogSchema = capabilities[PROTOCOL_VERSION]!.inlineCatalogs![0];
    for (const [name, component] of catalog.components) {
      // Описания SDK не переносит в inline-каталог, добавляем вручную.
      const target = catalogSchema?.components?.[name];
      if (!target) throw new Error(`Формат inline-каталога SDK изменился: нет компонента ${name}`);
      target.description = component.schema.description;
    }
    delete capabilities[PROTOCOL_VERSION]!.inlineCatalogs; // Схема передаётся отдельно.
    return structuredClone({
      protocolVersion: PROTOCOL_VERSION,
      capabilities,
      catalogSchema,
      protocolSchema: Schemas.A2uiMessageSchemaRaw,
      // Теги, которыми агент должен обрамлять сообщения: бэкенд читает их отсюда,
      // а фронт передаёт тот же объект в useA2ui({ framing }).
      framing,
      instructions: `${protocolInstructions}
${instructions}`,
    });
  } finally {
    processor.model.dispose();
  }
}
