import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
for (const key of ['window', 'document', 'Document', 'CSSStyleSheet', 'customElements', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'ShadowRoot', 'MutationObserver', 'navigator']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: (dom.window as unknown as Record<string, unknown>)[key] });
}
Object.defineProperty(globalThis, 'getComputedStyle', { value: dom.window.getComputedStyle.bind(dom.window), configurable: true });
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, writable: true });
dom.window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false, media: '', onchange: null });
const { frame, questionMessages, metricMessages, removeQuestion } = await import('./fixtures.js');
const { render, renderHook, fireEvent, waitFor, act, cleanup } = await import('@testing-library/react');
const { A2uiView, createA2uiController, useA2ui } = await import('../src/a2ui/index.js');
const { StrictMode } = await import('react');
after(() => dom.window.close());

test('AntD choices emit standard action, retry on failure and render another surface', async () => {
  const answers: unknown[] = []; let fail = true;
  const controller = createA2uiController(message => { if (fail) throw new Error('test'); answers.push(message); });
  questionMessages().forEach(m => controller.processMessage(m));
  const view = render(<A2uiView controller={controller} />);
  fireEvent.click(view.getByRole('button', { name: 'Выручка' }));
  await waitFor(() => assert.ok(view.getByText('Не удалось отправить ответ. Попробуйте ещё раз.')));
  fail = false; fireEvent.click(view.getByRole('button', { name: 'Количество заказов' }));
  await waitFor(() => assert.ok(view.getByText('Вы выбрали: Количество заказов')));
  assert.equal(answers.length, 1);
  assert.equal((view.getByRole('button', { name: 'Количество заказов' }) as HTMLButtonElement).disabled, true);
  act(() => { controller.processMessage(removeQuestion); questionMessages('next').forEach(m => controller.processMessage(m)); });
  assert.equal((view.getByRole('button', { name: 'Количество заказов' }) as HTMLButtonElement).disabled, false);
  cleanup(); controller.dispose();
});

test('hook handles StrictMode, replacement, latest action callback, clear and unmount', async () => {
  const answers: string[] = []; const text: string[] = [];
  const hook = renderHook(({ version }) => useA2ui({ onAction: () => { answers.push(version); } }), {
    initialProps: { version: 'old' }, wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
  });
  await act(async () => {});
  const first = hook.result.current.beginResponse({ onText: t => text.push(t) }); first.push('<a2');
  const second = hook.result.current.beginResponse({ onText: t => text.push(t) });
  act(() => { first.push(frame(questionMessages())); second.push(`Текст${frame(questionMessages())}`); second.finish(); });
  second.push('late'); assert.deepEqual(text, ['Текст']);
  assert.equal(hook.result.current.controller.getSnapshot().length, 1);
  hook.rerender({ version: 'new' });
  const view = render(<A2uiView controller={hook.result.current.controller} />);
  fireEvent.click(view.getByRole('button', { name: 'Выручка' }));
  await waitFor(() => assert.deepEqual(answers, ['new']));
  act(() => hook.result.current.clear()); assert.deepEqual(hook.result.current.controller.getSnapshot(), []);
  const final = hook.result.current.beginResponse({ onText: t => text.push(t) });
  const controller = hook.result.current.controller;
  view.unmount(); hook.unmount(); await Promise.resolve();
  final.push(frame(questionMessages())); final.finish(); assert.deepEqual(text, ['Текст']);
  assert.throws(() => controller.processMessage(metricMessages()[0]), /закрыт/); cleanup();
});

test('standard component and model updates render zero, negative decimal and multiple surfaces', () => {
  const controller = createA2uiController(() => {});
  const messages = metricMessages();
  if ('updateComponents' in messages[1]) Object.assign(messages[1].updateComponents.components[0], { value: 0, title: 'Заказы' });
  messages.forEach(m => controller.processMessage(m));
  const view = render(<A2uiView controller={controller} />);
  assert.equal(view.container.querySelector('.ant-statistic-content-value')?.textContent, '0');
  act(() => controller.processMessage({ version: 'v0.9', updateComponents: { surfaceId: 'result', components: [{
    id: 'root', component: 'MetricCard', title: 'Изменение', value: -12.5, unit: '%',
  }] } }));
  assert.ok(view.getByText('Изменение')); assert.ok(view.getByText('%'));
  assert.equal(view.container.querySelector('.ant-statistic-content-value')?.textContent, '-12,5');
  act(() => questionMessages().forEach(m => controller.processMessage(m)));
  assert.ok(view.getByRole('button', { name: 'Выручка' })); assert.ok(view.getByText('Изменение'));
  act(() => controller.clear()); assert.equal(view.container.textContent, ''); cleanup(); controller.dispose();
});
