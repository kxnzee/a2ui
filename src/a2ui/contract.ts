import { z } from 'zod';
import type { A2uiClientAction } from '@a2ui/web_core/v0_9';

export const OptionSchema = z.object({
  id: z.string().min(1).max(100),
  label: z.string().trim().min(1).max(160),
}).strict();

// Стандартное сообщение клиента A2UI v0.9, а не собственный DTO ответа.
export type A2uiActionMessage = { version: 'v0.9'; action: A2uiClientAction };
