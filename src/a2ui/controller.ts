import { A2uiMessageSchema, A2uiMessageListSchema, A2uiClientMessageSchema, MessageProcessor, STRICT_VALIDATION, type SurfaceModel } from '@a2ui/web_core/v0_9';
import type { ReactComponentImplementation } from '@a2ui/react/v0_9';
import type { A2uiActionMessage } from './contract.js';
import { a2uiCatalog } from './catalog.js';

export type ActionHandler = (message: A2uiActionMessage) => void | Promise<void>;
type Surface = SurfaceModel<ReactComponentImplementation>;
export type SurfaceEntry = { surface: Surface; key: number };

// Принимает стандартные сообщения напрямую. Выбор типа делает SDK по каталогу.
export class A2uiController {
  private readonly processor: MessageProcessor<ReactComponentImplementation>;
  private readonly listeners = new Set<() => void>();
  private snapshot: readonly SurfaceEntry[] = [];
  private revision = 0;
  private disposed = false;
  private readonly actionStates = new WeakMap<Surface, Map<string, { busy: boolean; answered: boolean }>>();

  constructor(onAction: ActionHandler) {
    this.processor = new MessageProcessor([a2uiCatalog], async action => {
      if (this.disposed) return;
      const surface = this.processor.getSurface(action.surfaceId);
      const component = surface?.componentsModel.get(action.sourceComponentId);
      if (!surface || !component) return;
      const properties = component.properties;
      const isClarification = component.type === 'ClarificationCard';
      let state: { busy: boolean; answered: boolean } | undefined;
      if (isClarification) {
        if (action.name !== 'clarification_answer' || action.context.questionId !== properties.questionId) return;
        if (!properties.options.some((option: { id: string }) => option.id === action.context.optionId)) return;
        let states = this.actionStates.get(surface);
        if (!states) { states = new Map(); this.actionStates.set(surface, states); }
        const key = JSON.stringify([component.id, properties.questionId]);
        state = states.get(key);
        if (!state) { state = { busy: false, answered: false }; states.set(key, state); }
        if (state.busy || state.answered) return;
        state.busy = true;
        this.updateBindings(surface, properties, { disabled: true, error: '' });
      }
      const isCurrent = () => !this.disposed && this.processor.getSurface(surface.id) === surface &&
        surface.componentsModel.get(component.id) === component && component.properties.questionId === properties.questionId &&
        ['selected', 'disabled', 'answered', 'error'].every(field => component.properties[field]?.path === properties[field]?.path);
      try {
        // SDK сериализует/валидирует стандартный формат обратного сообщения.
        const message = A2uiClientMessageSchema.parse({ version: 'v0.9', action }) as A2uiActionMessage;
        await onAction(message);
        if (state && isCurrent()) {
          state.answered = true;
          this.updateBindings(surface, properties, { disabled: true, answered: true });
        }
      } catch {
        if (state && isCurrent()) this.updateBindings(surface, properties, {
          disabled: false, error: 'Не удалось отправить ответ. Попробуйте ещё раз.',
        });
      } finally { if (state) state.busy = false; }
    }, { version: 'v0.9', validationConfig: { ...STRICT_VALIDATION, targetVersion: 'v0.9' } });
  }

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  readonly getSnapshot = () => this.snapshot;

  processMessage(input: unknown) {
    if (this.disposed) throw new Error('Контроллер уже закрыт');
    // Схема конверта из SDK, схемы компонентов — из того же Catalog.
    const message = A2uiMessageSchema.parse(input);
    if (message.version !== 'v0.9') throw new Error('Этот пример использует A2UI v0.9');
    try { this.processor.processMessages(message); }
    finally { this.refresh(); }
  }

  // Это массив сообщений протокола A2UI, не история чата [{role, content}].
  processMessages(input: unknown) {
    if (this.disposed) throw new Error('Контроллер уже закрыт');
    const messages = A2uiMessageListSchema.parse(input);
    if (messages.some(message => message.version !== 'v0.9')) throw new Error('Этот пример использует A2UI v0.9');
    try { this.processor.processMessages(messages); }
    finally { this.refresh(); }
  }

  clear() {
    for (const id of [...this.processor.getSurfaces().keys()]) {
      this.processor.processMessages({ version: 'v0.9', deleteSurface: { surfaceId: id } });
    }
    this.refresh();
  }
  dispose() {
    if (this.disposed) return;
    this.clear(); this.disposed = true; this.processor.dispose(); this.listeners.clear();
  }

  private updateBindings(surface: Surface, properties: Record<string, any>, values: Record<string, string | boolean>) {
    for (const [field, value] of Object.entries(values)) {
      const path = properties[field]?.path;
      if (typeof path !== 'string') continue;
      this.processor.processMessages({ version: 'v0.9', updateDataModel: { surfaceId: surface.id, path, value } });
    }
  }
  private refresh() {
    const surfaces = [...this.processor.getSurfaces().values()];
    if (surfaces.length === this.snapshot.length && surfaces.every((surface, i) => surface === this.snapshot[i]?.surface)) return;
    this.snapshot = surfaces.map(surface => this.snapshot.find(entry => entry.surface === surface) ?? { surface, key: ++this.revision });
    this.listeners.forEach(listener => listener());
  }
}
export function createA2uiController(onAction: ActionHandler) { return new A2uiController(onAction); }
