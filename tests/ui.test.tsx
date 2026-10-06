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
const { StrictMode, useState } = await import('react');
const { AgentChat } = await import('../src/example/AgentChat.js');
import type { ChatMessage, Send } from '../src/example/request.js';
after(() => dom.window.close());

test('AntD choices and bindings work in StrictMode; host controls disabled state', async () => {
  const answers: unknown[] = [];
  const processor = createA2uiProcessor(message => { answers.push(message); });
  processor.processMessages(questionMessages());
  const view = render(<StrictMode><A2uiView processor={processor} /></StrictMode>);
  fireEvent.click(view.getByRole('button', { name: 'Выручка' }));
  await waitFor(() => assert.equal(answers.length, 1));
  // После выбора карточка блокируется сама, повторный клик не шлёт второй action.
  assert.equal((view.getByRole('button', { name: 'Выручка' }) as HTMLButtonElement).disabled, true);
  fireEvent.click(view.getByRole('button', { name: 'Выручка' }));
  assert.equal(answers.length, 1);
  // Приложение разрешает повторный выбор, сбросив selected стандартным сообщением.
  act(() => processor.processMessages([{ version: 'v0.9', updateDataModel: {
    surfaceId: 'question', path: '/selected', value: '',
  } }]));
  assert.equal((view.getByRole('button', { name: 'Выручка' }) as HTMLButtonElement).disabled, false);
  act(() => processor.processMessages([{ version: 'v0.9', updateDataModel: {
    surfaceId: 'question', path: '/disabled', value: true,
  } }]));
  assert.equal((view.getByRole('button', { name: 'Выручка' }) as HTMLButtonElement).disabled, true);
  act(() => { processor.processMessages([removeQuestion]); processor.processMessages(questionMessages()); });
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

for (const stream of [true, false]) test(`example chat sends native card actions and shows send errors (${stream ? 'stream' : 'POST'})`, async () => {
  const bodies: Parameters<Send>[0][] = [];
  const content = `Уточнение: ${frame(questionMessages())}`;
  const send: Send = (body, callbacks) => {
    bodies.push(body);
    if (bodies.length === 1) {
      if (body.stream) { callbacks.onTextDelta(content); callbacks.onDone(); }
      else callbacks.onResponse(content);
      return { accepted: Promise.resolve(), cancel() {} };
    }
    return { accepted: Promise.reject(new Error('Сеть недоступна')), cancel() {} };
  };
  function Chat() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    return <AgentChat send={send} messages={messages} onMessagesChange={setMessages} stream={stream} />;
  }
  const view = render(<StrictMode><Chat /></StrictMode>);
  fireEvent.click(view.getByRole('button', { name: 'Запросить график' }));
  assert.ok(view.getByText('Уточнение:'));
  assert.equal(view.container.textContent?.includes('<a2ui>'), false);
  fireEvent.click(view.getByRole('button', { name: 'Количество заказов' }));
  await waitFor(() => assert.equal(view.getByRole('alert').textContent, 'Сеть недоступна'));
  assert.equal(bodies.length, 2);
  assert.equal(bodies[1].messages[1].content, content);
  const action = JSON.parse(bodies[1].messages[2].content);
  assert.equal(action.version, 'v0.9');
  assert.deepEqual(action.action.context, { optionId: 'orders' });
  cleanup();
  await act(async () => {});
});

test('card with model-prefilled selected is not locked before the first click', async () => {
  const answers: unknown[] = [];
  const messages = questionMessages();
  const update = messages[1];
  if ('updateDataModel' in update) update.updateDataModel.value = { selected: 'revenue', disabled: false };
  const processor = createA2uiProcessor(message => { answers.push(message); });
  processor.processMessages(messages);
  const view = render(<A2uiView processor={processor} />);
  assert.equal((view.getByRole('button', { name: 'Выручка' }) as HTMLButtonElement).disabled, false);
  fireEvent.click(view.getByRole('button', { name: 'Выручка' }));
  assert.equal((view.getByRole('button', { name: 'Выручка' }) as HTMLButtonElement).disabled, true);
  cleanup(); processor.model.dispose();
});

test('onAction failures go to onActionError instead of unhandled rejections', async () => {
  const errors: Error[] = [];
  for (const fail of [() => { throw new Error('sync'); }, async () => { throw new Error('async'); }]) {
    const hook = renderHook(() => useA2ui({ onAction: fail, onActionError: e => errors.push(e) }));
    hook.result.current.processor.processMessages(questionMessages());
    const view = render(<A2uiView processor={hook.result.current.processor} />);
    fireEvent.click(view.getByRole('button', { name: 'Выручка' }));
    await waitFor(() => assert.equal(errors.length, fail.constructor.name === 'AsyncFunction' ? 2 : 1));
    cleanup();
  }
  assert.deepEqual(errors.map(e => e.message), ['sync', 'async']);
});

test('processor survives hide/show of the owning component', async () => {
  const hook = renderHook(() => useA2ui({ onAction() {} }));
  const { processor } = hook.result.current;
  processor.processMessages(questionMessages());
  hook.unmount();
  const again = renderHook(() => useA2ui({ onAction() {} }));
  assert.notEqual(again.result.current.processor, processor);
  // Тот же processor остаётся рабочим после cleanup: dispose не вызывается.
  processor.processMessages(metricMessages());
  assert.equal(processor.model.surfacesMap.size, 2);
  cleanup();
});
