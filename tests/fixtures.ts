import { getAgentConfiguration } from '../src/a2ui/agent.js';
import type { A2uiMessage } from '@a2ui/web_core/v0_9';
export const frame = (messages: readonly A2uiMessage[]) => messages.map(m => `<a2ui>${JSON.stringify(m)}</a2ui>`).join('');
export function questionMessages(questionId = 'metric-1') {
  const messages = getAgentConfiguration().examples.clarification;
  const message = messages[2];
  if ('updateComponents' in message) {
    const card = message.updateComponents.components[0];
    card.questionId = questionId;
    card.onSelect.event.context.questionId = questionId;
  }
  return messages;
}
export const metricMessages = () => getAgentConfiguration().examples.metric;
export const removeQuestion: A2uiMessage = { version: 'v0.9', deleteSurface: { surfaceId: 'question' } };
