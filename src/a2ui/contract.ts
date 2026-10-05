import { z } from 'zod';

export const OptionSchema = z.object({
  id: z.string().min(1).max(100),
  label: z.string().trim().min(1).max(160),
}).strict();

export const ClarificationSchema = z.object({
  questionId: z.string().min(1).max(100),
  question: z.string().trim().min(1).max(600),
  options: z.array(OptionSchema).min(2).max(6),
}).strict().refine(
  question => new Set(question.options.map(option => option.id)).size === question.options.length,
  { message: 'ID вариантов должны быть уникальны', path: ['options'] },
);
export const MetricSchema = z.object({
  title: z.string().trim().min(1).max(160),
  value: z.number().finite(),
  unit: z.string().trim().min(1).max(24).optional(),
}).strict();

// Разрешённые типы задаются явно: модель не может передать произвольный компонент.
export const A2uiComponentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('clarification'), props: ClarificationSchema }).strict(),
  z.object({ type: z.literal('metric'), props: MetricSchema }).strict(),
]);
export type A2uiComponent = z.infer<typeof A2uiComponentSchema>;
export type Metric = z.infer<typeof MetricSchema>;
export type Clarification = z.infer<typeof ClarificationSchema>;
export type ClarificationAnswer = {
  type: 'clarification_answer'; questionId: string; optionId: string; label: string;
};

// Передайте эту строку в существующую интеграцию локальной модели.
export const A2UI_INSTRUCTIONS = `Доступны два UI-компонента. Выбирай по смыслу задачи:
1. clarification: если для продолжения нужен выбор пользователя. Не выдавай окончательный результат до ответа.
2. metric: если нужно показать одно известное число с названием и необязательной единицей. Не выдумывай значение; если данных нет, попроси их обычным текстом или уточнением.
Если компонент не нужен, отвечай обычным текстом.
Для компонента выведи блок <ui>JSON</ui>. Только поля type и props; внутри JSON без Markdown.
Пример уточнения:
<ui>{"type":"clarification","props":{"questionId":"metric-1","question":"Что показать?","options":[{"id":"revenue","label":"Выручка"},{"id":"orders","label":"Заказы"}]}}</ui>
Пример известного числового результата:
<ui>{"type":"metric","props":{"title":"Выручка","value":1250000,"unit":"₽"}}</ui>
clarification.props: только questionId (1–100 символов), question (1–600), options (2–6 вариантов). У варианта только id (1–100) и label (1–160). ID вариантов уникальны. Каждому новому вопросу нужен новый questionId.
metric.props: только title (1–160), value (конечное JSON-число, не строка), unit (необязательно, 1–24 символа).
Тексты не пустые. Не добавляй неизвестные поля или типы. Не включай </ui> в строковые значения JSON.
Обычный текст пиши вне блоков. После выбора пользователя продолжи исходную задачу с учётом ответа.
UI показывает текущую карточку: каждый новый блок заменяет предыдущую.`;
