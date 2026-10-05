import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
for (const key of ['window', 'document', 'Document', 'CSSStyleSheet', 'customElements', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'ShadowRoot', 'MutationObserver', 'navigator']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: (dom.window as unknown as Record<string, unknown>)[key] });
}
Object.defineProperty(globalThis, 'getComputedStyle', { value: dom.window.getComputedStyle.bind(dom.window), configurable: true });
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, writable: true });
dom.window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false, media: '', onchange: null });
const { render, fireEvent, waitFor, act, cleanup } = await import('@testing-library/react');
const { ClarificationSurface, createClarificationController } = await import('../src/ui/index.js');

test('AntD buttons send selected payload, show retry and render replacement question', async () => {
  const answers: unknown[] = []; let fail = true;
  const controller = createClarificationController(answer => { if (fail) throw new Error('test'); answers.push(answer); });
  const question = { questionId: 'q1', question: 'Что показать?', options: [{ id: 'a', label: 'Выручка' }, { id: 'b', label: 'Заказы' }] };
  controller.showQuestion(question);
  const view = render(<ClarificationSurface controller={controller} />);
  fireEvent.click(view.getByRole('button', { name: 'Выручка' }));
  await waitFor(() => assert.ok(view.getByText('Не удалось отправить ответ. Попробуйте ещё раз.')));
  fail = false; fireEvent.click(view.getByRole('button', { name: 'Заказы' }));
  await waitFor(() => assert.ok(view.getByText('Вы выбрали: Заказы')));
  assert.deepEqual(answers, [{ type: 'clarification_answer', questionId: 'q1', optionId: 'b', label: 'Заказы' }]);
  assert.equal((view.getByRole('button', { name: 'Заказы' }) as HTMLButtonElement).disabled, true);
  act(() => controller.showQuestion({ ...question, questionId: 'q2', question: 'Следующий вопрос' }));
  assert.ok(view.getByText('Следующий вопрос'));
  assert.equal((view.getByRole('button', { name: 'Заказы' }) as HTMLButtonElement).disabled, false);
  cleanup(); controller.dispose(); dom.window.close();
});
