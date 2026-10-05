# Подключение к вашему React-приложению

Сначала фронт: существующий запрос должен предоставлять callbacks для **текстовых дельт**, завершения и ошибки. В примере ниже `send` — адаптер к вашему уже подключённому запросу, не новая HTTP-реализация.

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ClarificationSurface,
  createClarificationController,
  createClarificationStream,
  type ClarificationAnswer,
} from '@kxnzee/a2ui-clarification-ui';
// При копировании исходников: import ... from './ui/index';

type Send = (
  input: string | ClarificationAnswer,
  callbacks: {
    onTextDelta: (delta: string) => void;
    onDone: () => void;
    onError: (error: Error) => void;
  },
) => { accepted: Promise<void>; cancel: () => void };

export function AgentChat({ send }: { send: Send }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const sendRef = useRef(send);
  sendRef.current = send;
  const active = useRef<(() => void) | undefined>(undefined);
  const mounted = useRef(true);
  const requestRef = useRef<(input: string | ClarificationAnswer) => Promise<void>>(
    async () => {},
  );
  const controller = useMemo(
    () => createClarificationController(answer => requestRef.current(answer)),
    [],
  );

  requestRef.current = async input => {
    active.current?.();
    setText('');
    setError('');
    // Новый декодер на каждый ответ агента, один контроллер на диалог.
    const stream = createClarificationStream({
      onText: delta => { if (mounted.current) setText(t => t + delta); },
      onClarification: question => controller.showQuestion(question),
      onError: e => { if (mounted.current) setError(e.message); },
    });
    let cancelled = false;
    const request = sendRef.current(input, {
      onTextDelta: delta => { if (!cancelled) stream.push(delta); },
      onDone: () => { if (!cancelled) stream.finish(); },
      onError: e => {
        stream.cancel();
        cancelled = true;
        if (mounted.current) setError(e.message);
      },
    });
    active.current = () => {
      cancelled = true;
      stream.cancel();
      request.cancel();
    };
    await request.accepted; // rejected → карточка покажет ошибку и позволит повторить
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.();
      // React StrictMode повторяет setup/cleanup эффектов в dev.
      // Отложенное dispose выполняется только при реальном unmount.
      queueMicrotask(() => { if (!mounted.current) controller.dispose(); });
    };
  }, [controller]);

  async function start() {
    controller.clear();
    try { await requestRef.current('Покажи график с цифрами'); }
    catch { setError('Не удалось отправить запрос'); }
  }

  return <>
    <button onClick={start}>Запросить график</button>
    <p style={{ whiteSpace: 'pre-wrap' }}>{text}</p>
    {error && <p role="alert">{error}</p>}
    <ClarificationSurface controller={controller} />
  </>;
}
```

`send` должен завершать `accepted` при принятии сообщения агентом (или завершении ответа, если так устроен ваш транспорт). Ошибка до принятия должна отклонять этот Promise: один вызов `onError` без rejection не разблокирует карточку. `cancel` прекращает доставку callbacks. На стороне приложения для ответа можно передавать весь объект либо превратить его в текст, например `answer.label`. Не запускайте два запроса одного диалога одновременно. Для нескольких диалогов создайте отдельные контроллеры.

Обычный текст чата берите из `onText` декодера: если параллельно выводить исходные чанки, пользователю будут видны служебные теги и JSON. При завершении обязательно вызывайте `finish`, при отмене — `cancel`. Существующий чат может хранить сообщения в истории вместо одного поля `text`, как в этом минимальном примере.

## Что передать локальной модели

Интернет модели не нужен. Добавьте локальную строку `CLARIFICATION_INSTRUCTIONS` к вашим существующим инструкциям агента:

```ts
import { CLARIFICATION_INSTRUCTIONS } from '@kxnzee/a2ui-clarification-ui';
const systemPrompt = `${yourExistingPrompt}\n\n${CLARIFICATION_INSTRUCTIONS}`;
```

Это не выполняет запрос; вы передаёте `systemPrompt` в свою интеграцию. Ожидаемый ответ агента в текстовом стриме:

```text
Уточню один момент.
<clarification>{"questionId":"metric-1","question":"Какой показатель показать?","options":[{"id":"revenue","label":"Выручка"},{"id":"orders","label":"Заказы"}]}</clarification>
```

Можно разделить эту строку на любые чанки. Пока блок не завершён, карточки нет. После клика UI отдаёт:

```json
{"type":"clarification_answer","questionId":"metric-1","optionId":"orders","label":"Заказы"}
```

Ваш существующий транспорт отправляет этот объект или его текстовое представление в тот же диалог. Агент продолжает ответ обычным текстом либо задаёт следующий вопрос с новым `questionId`. Каждому новому вопросу нужен новый идентификатор. Повтор идентичного текущего вопроса не сбрасывает его состояние; изменение вопроса при том же идентификаторе отклоняется.

Контракт строго разрешает поля `questionId`, `question`, `options`; 2–6 вариантов с уникальными `id`; вопрос до 600 символов, подпись до 160. JSON без Markdown внутри тегов, без `</clarification>` в строковых значениях. Ограничение блока — 32 Ки символов. Если ваши инструкции/модель не поддерживают такой ответ, из одного обычного текста UI надёжно не узнает варианты.

## Где регистрируется собственный компонент

В `src/ui/catalog.tsx`:

```tsx
import { z } from 'zod';
import { Catalog, CommonSchemas } from '@a2ui/web_core/v0_9';
import { createComponentImplementation } from '@a2ui/react/v0_9';
import { Card } from 'antd';

const api = { name: 'MyCard', schema: z.object({ title: z.string() }).strict() };
const implementation = createComponentImplementation(api, ({ props }) => (
  <Card title={props.title} />
));
const catalog = new Catalog('urn:my-app:catalog:v1', 'v0.9', [implementation], []);
```

В рабочем примере `ClarificationCard` дополнительно использует `CommonSchemas.Action` для события и DynamicString/DynamicBoolean для состояния. Контроллер создаёт `MessageProcessor([clarificationCatalog], onAction)`, сообщения `createSurface`, `updateDataModel`, `updateComponents`; `ClarificationSurface` передаёт созданную поверхность в `A2uiSurface`. Обработчик события сопоставляет вариант с проверенным вопросом, затем вызывает callback приложения. Для следующего компонента добавьте схему, React-реализацию и явный адаптер в контроллере. Агенту передавайте разрешённый JSON-контракт нового компонента и примеры, а не произвольный JSX.
