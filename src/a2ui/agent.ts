import { MessageProcessor, Schemas, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { a2uiCatalog, CATALOG_ID } from './catalog.js';

// Примеры стандартных сообщений для prompt и эмулятора. Не новый wire-контракт.
const examples: Record<'clarification' | 'metric', A2uiMessage[]> = {
  clarification: [
    { version: 'v0.9', createSurface: { surfaceId: 'question', catalogId: CATALOG_ID } },
    { version: 'v0.9', updateDataModel: { surfaceId: 'question', path: '/', value: {
      selected: '', disabled: false, answered: false, error: '',
    } } },
    { version: 'v0.9', updateComponents: { surfaceId: 'question', components: [{
      id: 'root', component: 'ClarificationCard', questionId: 'metric-1',
      question: 'Какой показатель показать?',
      options: [{ id: 'revenue', label: 'Выручка' }, { id: 'orders', label: 'Количество заказов' }],
      selected: { path: '/selected' }, disabled: { path: '/disabled' },
      answered: { path: '/answered' }, error: { path: '/error' },
      onSelect: { event: { name: 'clarification_answer', context: {
        questionId: 'metric-1', optionId: { path: '/selected' },
      } } },
    }] } },
  ],
  metric: [
    { version: 'v0.9', createSurface: { surfaceId: 'result', catalogId: CATALOG_ID } },
    { version: 'v0.9', updateComponents: { surfaceId: 'result', components: [{
      id: 'root', component: 'MetricCard', title: 'Выручка', value: 1250000, unit: '₽',
    }] } },
  ],
};

let cachedCapabilities: ReturnType<MessageProcessor['getRendererCapabilities']> | undefined;

export function getAgentConfiguration() {
  if (!cachedCapabilities) {
    const processor = new MessageProcessor([a2uiCatalog]);
    cachedCapabilities = processor.getRendererCapabilities({ versions: ['v0.9'], includeInlineCatalogs: true });
    processor.dispose();
  }
  return {
    protocolVersion: 'v0.9',
    capabilities: structuredClone(cachedCapabilities),
    catalogSchema: a2uiCatalog.catalogSchema,
    protocolSchema: Schemas.A2uiMessageSchemaRaw,
    instructions: `Используй стандартные сообщения A2UI v0.9: createSurface, updateComponents, updateDataModel, deleteSurface.
Компонент выбирается полем component в updateComponents. Свойства компонента находятся рядом с id и component, без props или type.
Сначала createSurface, затем данные и компоненты. Для новой поверхности новый surfaceId; для существующей — updateComponents/updateDataModel. Не повторяй createSurface для существующего ID.
Транспорт этого чата текстовый: помещай каждое полное JSON-сообщение в отдельный блок <a2ui>JSON</a2ui>. Обычный текст пиши вне блоков. Не включай </a2ui> в строки JSON. Теги не являются частью протокола A2UI.
${a2uiCatalog.instructions}`,
    examples: structuredClone(examples),
  };
}
