import type { A2uiMessage } from '@a2ui/web_core/v0_9';
import { CATALOG_ID } from '../a2ui/catalog.js';

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

export function getDemoMessages() { return structuredClone(examples); }
