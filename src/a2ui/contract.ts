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

export type Clarification = z.infer<typeof ClarificationSchema>;
export type ClarificationAnswer = {
  type: 'clarification_answer';
  questionId: string;
  optionId: string;
  label: string;
};

// Подключается к существующим инструкциям агента, без SDK/интернета.
export const CLARIFICATION_INSTRUCTIONS = `Если нужно уточнение, выведи один блок:
<clarification>
{"questionId":"уникальный-ID-вопроса","question":"Текст вопроса?","options":[{"id":"a","label":"Первый вариант"},{"id":"b","label":"Второй вариант"}]}
</clarification>
Внутри блока только JSON, без Markdown. От 2 до 6 вариантов с уникальными ID.
Только поля questionId, question, options; у варианта только id и label.
questionId и id: 1–100 символов; question: 1–600; label: 1–160, не пустые.
Для каждого нового вопроса используй новый questionId.
Обычный текст пиши вне блока. Не включай закрывающий тег в строки JSON.
После выбора пользователя продолжи исходную задачу с учётом ответа.`;
