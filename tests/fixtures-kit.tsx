import { Catalog } from '@a2ui/web_core/v0_9';
import { createComponentImplementation } from '@a2ui/react/v0_9';
import { z } from 'zod-a2ui';
import type { A2uiCatalogKit } from '../src/a2ui/index.js';

// Чужой каталог для проверки экспорта конфигурации агента без карточек.
const Badge = createComponentImplementation(
  { name: 'Badge', schema: z.object({ text: z.string() }).strict().describe('Бейдж.') },
  () => null,
);
export const kit: A2uiCatalogKit = { catalog: new Catalog('urn:acme:badges:v1', [Badge]), instructions: 'Используй Badge.' };
export const examples = { badge: [] };
