import { MessageProcessor, type SurfaceModel } from '@a2ui/web_core/v0_9';
import type { ReactComponentImplementation } from '@a2ui/react/v0_9';
import { ClarificationSchema, type Clarification, type ClarificationAnswer } from './contract.js';
import { CATALOG_ID, SURFACE_ID, clarificationCatalog } from './catalog.js';

export type AnswerHandler = (answer: ClarificationAnswer) => void | Promise<void>;

// Контроллер не выполняет сетевые запросы. Транспорт принадлежит приложению.
export class ClarificationController {
  private readonly processor: MessageProcessor<ReactComponentImplementation>;
  private readonly listeners = new Set<() => void>();
  private question?: Clarification;
  private surface?: SurfaceModel<ReactComponentImplementation>;
  private busy = false;
  private answered = false;
  private disposed = false;
  private revision = 0;

  constructor(private readonly onAnswer: AnswerHandler) {
    this.processor = new MessageProcessor([clarificationCatalog], async action => {
      const question = this.question;
      if (this.disposed || this.busy || this.answered || !question) return;
      if (action.name !== 'clarification_answer' ||
          action.context.questionId !== question.questionId) return;
      const option = question.options.find(item => item.id === action.context.optionId);
      if (!option) return;
      this.busy = true;
      this.update({ disabled: true, error: '' });
      try {
        await this.onAnswer({
          type: 'clarification_answer', questionId: question.questionId,
          optionId: option.id, label: option.label,
        });
        if (!this.disposed && this.question === question) {
          this.answered = true;
          this.update({ answered: true, disabled: true });
        }
      } catch {
        if (!this.disposed && this.question === question) {
          this.update({ disabled: false, error: 'Не удалось отправить ответ. Попробуйте ещё раз.' });
        }
      } finally {
        if (this.question === question) this.busy = false;
      }
    });
  }

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  readonly getSnapshot = () => this.surface;
  readonly getQuestionId = () => this.question?.questionId;
  readonly getSurfaceKey = () => this.revision;

  showQuestion(input: unknown) {
    if (this.disposed) throw new Error('Контроллер уже закрыт');
    const question = ClarificationSchema.parse(input);
    if (this.question?.questionId === question.questionId) {
      if (JSON.stringify(this.question) === JSON.stringify(question)) return;
      throw new Error('Для изменённого вопроса нужен новый questionId');
    }
    this.clear();
    this.question = question;
    this.revision++;
    this.processor.processMessages([
      { version: 'v0.9', createSurface: { surfaceId: SURFACE_ID, catalogId: CATALOG_ID } },
      { version: 'v0.9', updateDataModel: {
        surfaceId: SURFACE_ID, path: '/',
        value: { selected: '', disabled: false, answered: false, error: '' },
      } },
      { version: 'v0.9', updateComponents: {
        surfaceId: SURFACE_ID,
        components: [{
          id: 'root', component: 'ClarificationCard',
          question: question.question, options: question.options,
          selected: { path: '/selected' }, disabled: { path: '/disabled' },
          answered: { path: '/answered' }, error: { path: '/error' },
          onSelect: { event: {
            name: 'clarification_answer',
            context: { questionId: question.questionId, optionId: { path: '/selected' } },
          } },
        }],
      } },
    ]);
    this.surface = this.processor.getSurface(SURFACE_ID);
    this.notify();
  }

  clear() {
    if (this.surface) {
      this.processor.processMessages({
        version: 'v0.9', deleteSurface: { surfaceId: SURFACE_ID },
      });
    }
    this.surface = undefined;
    this.question = undefined;
    this.busy = false;
    this.answered = false;
    this.notify();
  }

  dispose() {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    this.processor.dispose();
    this.listeners.clear();
  }

  private update(values: Record<string, string | boolean>) {
    for (const [key, value] of Object.entries(values)) {
      this.processor.processMessages({
        version: 'v0.9', updateDataModel: { surfaceId: SURFACE_ID, path: `/${key}`, value },
      });
    }
  }
  private notify() { this.listeners.forEach(listener => listener()); }
}

export function createClarificationController(onAnswer: AnswerHandler) {
  return new ClarificationController(onAnswer);
}
