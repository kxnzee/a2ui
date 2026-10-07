// Универсальный слой: не зависит от AntD и от конкретных компонентов.
// Готовые карточки (AntD) — отдельный необязательный модуль ./cards.js.
export { A2uiView } from './A2uiView.js';
export {
  createA2uiProcessor,
  type A2uiProcessor, type A2uiCatalog, type A2uiCatalogKit, type ActionHandler, type A2uiActionMessage,
} from './processor.js';
export { createA2uiStream, type StreamOptions } from './stream.js';
export { getAgentConfiguration } from './agent.js';
export { useA2ui, type A2uiResponse, type A2uiResponseOptions } from './useA2ui.js';
