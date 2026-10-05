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
const { A2uiView, createA2uiProcessor, useA2ui } = await import('../src/a2ui/index.js');
const { StrictMode } = await import('react');
after(() => dom.window.close());

test('AntD choices and bindings work in StrictMode; host controls disabled state', async () => {
  const answers: unknown[] = [];
  const processor = createA2uiProcessor(message => { answers.push(message); });
  processor.processMessages(questionMessages());
  const view = render(<StrictMode><A2uiView processor={processor} /></StrictMode>);
  fireEvent.click(view.getByRole('button', { name: 'Выручка' }));
  await waitFor(() => assert.equal(answers.length, 1));
  assert.equal((view.getByRole('button', { name: 'Выручка' }) as HTMLButtonElement).disabled, false);
  assert.equal(view.queryByText('Вы выбрали: Выручка'), null);
  act(() => processor.processMessages([{ version: 'v0.9', updateDataModel: {
    surfaceId: 'question', path: '/disabled', value: true,
  } }]));
  assert.equal((view.getByRole('button', { name: 'Выручка' }) as HTMLButtonElement).disabled, true);
  act(() => { processor.processMessages([removeQuestion]); processor.processMessages(questionMessages('next')); });
  assert.equal((view.getByRole('button', { name: 'Количество заказов' }) as HTMLButtonElement).disabled, false);
  cleanup(); processor.model.dispose();
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
  assert.equal(hook.result.current.processor.model.surfacesMap.size, 1);
  hook.rerender({ version: 'new' });
  const view = render(<A2uiView processor={hook.result.current.processor} />);
  fireEvent.click(view.getByRole('button', { name: 'Выручка' }));
  await waitFor(() => assert.deepEqual(answers, ['new']));
  act(() => hook.result.current.clear()); assert.equal(hook.result.current.processor.model.surfacesMap.size, 0);
  const final = hook.result.current.beginResponse({ onText: t => text.push(t) });
  const processor = hook.result.current.processor;
  view.unmount(); hook.unmount(); await Promise.resolve();
  final.push(frame(questionMessages())); final.finish(); assert.deepEqual(text, ['Текст']);
  assert.equal(processor.model.surfacesMap.size, 0); cleanup();
});

test('standard component and model updates render zero, negative decimal and multiple surfaces', () => {
  const processor = createA2uiProcessor(() => {});
  const messages = metricMessages();
  if ('updateComponents' in messages[1]) Object.assign(messages[1].updateComponents.components[0], { value: 0, title: 'Заказы' });
  messages.forEach(m => processor.processMessages([m]));
  const view = render(<A2uiView processor={processor} />);
  assert.equal(view.container.querySelector('.ant-statistic-content-value')?.textContent, '0');
  act(() => processor.processMessages([{ version: 'v0.9', updateComponents: { surfaceId: 'result', components: [{
    id: 'root', component: 'MetricCard', title: 'Изменение', value: -12.5, unit: '%',
  }] } }]));
  assert.ok(view.getByText('Изменение')); assert.ok(view.getByText('%'));
  assert.equal(view.container.querySelector('.ant-statistic-content-value')?.textContent, '-12,5');
  act(() => questionMessages().forEach(m => processor.processMessages([m])));
  assert.ok(view.getByRole('button', { name: 'Выручка' })); assert.ok(view.getByText('Изменение'));
  act(() => { for (const surfaceId of processor.model.surfacesMap.keys()) processor.processMessages([{ version: 'v0.9', deleteSurface: { surfaceId } }]); }); assert.equal(view.container.textContent, ''); cleanup(); processor.model.dispose();
});


test('web_core 0.11 renders unknown components as SDK placeholders', () => {
  const processor = createA2uiProcessor(() => {});
  processor.processMessages(metricMessages());
  const view = render(<A2uiView processor={processor} />);
  act(() => processor.processMessages([{ version: 'v0.9', updateComponents: {
    surfaceId: 'result', components: [{ id: 'root', component: 'Unknown' }],
  } }]));
  assert.ok(view.getByText(/Unknown component:/));
  cleanup(); processor.model.dispose();
});
