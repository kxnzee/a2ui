# Подключение стандартного A2UI к существующему UI и чату

Переносите только [`src/a2ui`](../src/a2ui). [README модуля](../src/a2ui/README.md) содержит карту файлов, зависимости, стандартные сообщения и правила lifecycle. [`src/example/AgentChat.tsx`](../src/example/AgentChat.tsx) — компилируемый внешний адаптер вашего запроса, не новый HTTP-клиент.

## Фронт и запрос

```tsx
import { useA2ui, A2uiView, type A2uiActionMessage } from './features/a2ui';

// Внутри вашего компонента чата:
const a2ui = useA2ui({
  onAction: async (message: A2uiActionMessage) => {
    // Стандартное сообщение {version, action} → ваш существующий запрос.
    await existingSendToAgent(message);
  },
});

// Перед каждым запросом / ответом агента:
const response = a2ui.beginResponse({
  onText: delta => appendToMessage(messageId, delta),
  onError: error => setMessageError(messageId, error.message),
});

const request = existingStreamingRequest(input, {
  onTextDelta: response.push,
  onDone: response.finish,
  onError: error => {
    response.cancel();
    setMessageError(messageId, error.message);
  },
});

// В разметке существующего чата:
<A2uiView controller={a2ui.controller} />

// При пользовательской отмене:
response.cancel();
request.cancel();
```

Имена функций выше обозначают ваши методы: сопоставьте callbacks с текущим транспортом. Не создавайте response при рендере; один response на ответ агента. Создавайте его и для ответа после выбора варианта. Привяжите onText к конкретному сообщению вашего store. Ошибка отправки также должна отклонять Promise в onAction: одного транспортного onError недостаточно для повтора выбора.

`push` принимает уже извлечённые текстовые дельты, не SSE-конверты/байты/накопленный текст. Чат должен выводить обычный текст из onText вместо исходных чанков. История, Markdown, скролл, загрузка, запрос и отмена транспорта остаются вашему приложению. При сбросе диалога вызывайте clear; при смене диалога используйте отдельный экземпляр хука.

Если ваши события стрима уже содержат отдельное поле с JSON A2UI, вызывайте `a2ui.controller.processMessage(event.a2ui)` напрямую и продолжайте выводить текст своей интеграцией. Теги в этом варианте не нужны.

## Два режима вашего транспорта

`Transfer-Encoding: chunked` описывает HTTP-доставку, а не структуру A2UI. Ваш транспорт декодирует UTF-8 с сохранением состояния между сетевыми чанками (`TextDecoder.decode(bytes, {stream: true})` и финальный flush). Если поверх HTTP есть SSE/JSON-конверты, он также извлекает текстовую дельту. В модуль передаётся только строка через response.push; произвольные разрывы тегов/JSON поддерживаются. Сам заголовок UI не анализирует.

Для обычного POST с историей:

```ts
const body = {
  messages: [...existingChatMessages, { role: 'user', content: userText }],
  stream: false,
};
// body отправляет ваш существующий запрос, а не модуль A2UI.

// После полного ответа: извлеките assistant.content по схеме вашего API.
response.push(assistantContent);
response.finish();
```

Для стрима отправка может использовать тот же массив messages и `stream: true`; дельты передаются в response.push по мере получения. Поле stream показано как пример переключения режимов — согласуйте с вашим API. Callback onAction при выборе превращает стандартное сообщение A2UI в JSON-строку и добавляет её как следующее пользовательское сообщение в тот же диалог:

```ts
const nextUserContent = JSON.stringify(a2uiActionMessage);
const nextMessages = [...existingChatMessages, { role: 'user', content: nextUserContent }];
```

Историю, включая предыдущий ответ assistant с исходными A2UI-блоками, хранит ваш чат. Исходные блоки не показываются в видимом тексте, но должны оставаться в контексте агента для продолжения. Не потеряйте их, если для отображения храните только результат onText. Модуль не изменяет массив messages.

Если **ответ**, отдельно от истории чата, уже содержит массив стандартных A2UI-сообщений, передайте его напрямую:

```ts
a2ui.controller.processMessages(a2uiProtocolMessages);
```

Этот массив содержит `{version, createSurface/updateComponents/…}`, а не `{role, content}`. Для массива chat messages сначала извлеките содержимое нужного assistant-сообщения своим адаптером. Пример обоих режимов с импортами и callbacks — src/example/AgentChat.tsx.

## Передача каталога локальному агенту

```ts
import { getAgentConfiguration } from './features/a2ui';

const config = getAgentConfiguration();
const systemPrompt = [
  yourExistingPrompt,
  config.instructions,
  `Каталог компонентов:\n${JSON.stringify(config.catalogSchema)}`,
  `Схема сообщений A2UI:\n${JSON.stringify(config.protocolSchema)}`,
  `Примеры стандартных сообщений:\n${JSON.stringify(config.examples)}`,
].join('\n\n');
// Передайте systemPrompt вашей существующей интеграции модели.
// Если она поддерживает capabilities negotiation, передайте config.capabilities.
```

Не нужно регистрировать ещё один независимый JSON-контракт или поддерживать схемы в prompt вручную. Каталог и схемы берутся из SDK и единой регистрации компонентов. Модель выбирает `ClarificationCard` или `MetricCard` по их описанию и Catalog.instructions. Сам React SDK не вызывает вашу модель и не меняет её prompt.

Если агент находится на отдельном backend без React/Node.js, заранее выполните:

```bash
npm run export:agent
```

Перенесите **весь `dist/agent`** в контур. Основные файлы: catalogSchema.json, protocolSchema.json, capabilities.json, instructions.txt, examples.json. Рядом скопированы оригинальные JSON-схемы из установленного SDK, включая common_types.json, для локального разрешения $ref. Backend читает эти файлы как данные; npm и React ему не нужны. URI catalogId идентифицирует каталог, но не требует запроса в интернет. Конфигурацию обновляйте вместе с версией фронта.

## Ответ агента

Обычный текст и два стандартных сообщения:

```text
Вот показатель.
<a2ui>{"version":"v0.9","createSurface":{"surfaceId":"result","catalogId":"urn:kxnzee:a2ui:cards:v1"}}</a2ui>
<a2ui>{"version":"v0.9","updateComponents":{"surfaceId":"result","components":[{"id":"root","component":"MetricCard","title":"Выручка","value":1250000,"unit":"₽"}]}}</a2ui>
```

Для ClarificationCard последовательность состоит из createSurface, updateDataModel с начальным состоянием и updateComponents с карточкой/действием. Полный пример берётся из `getAgentConfiguration().examples.clarification` или examples.json; эмулятор использует тот же пример.

Декодер передаёт стандартное сообщение в MessageProcessor без преобразования. SDK проверяет его по протоколу и каталогу; A2uiView рендерит все активные поверхности. Новое сообщение может обновить карточку или её данные, а не обязательно заменить всю поверхность. Для удаления агент выдаёт deleteSurface.

`<a2ui>` только отделяет JSON от текста: это выбранное обрамление вашего текстового транспорта, не часть стандарта A2UI. Модель должна соблюдать формат; строгая JSON-генерация и повтор при ошибке настраиваются в вашей интеграции. Схемы и проверка UI не гарантируют, что LLM всегда сформирует валидный ответ.

## Нажатие пользователя

`onAction` получает стандартное клиентское сообщение `{version: 'v0.9', action: {name, surfaceId, sourceComponentId, timestamp, context}}`. В нашем примере name — clarification_answer, context содержит questionId и optionId. Отправляйте полный объект либо JSON-строку в тот же диалог. Следующий ответ агента обрабатывается новым response. Повторные клики блокируются на время отправки и после успеха, при ошибке карточка позволяет повторить. Серверную идемпотентность обеспечивает ваше приложение.

## Добавление компонентов

В catalog.tsx добавьте Zod-схему с description, React-реализацию через createComponentImplementation и регистрацию в Catalog. Общие инструкции хранятся в Catalog.instructions. Затем повторите export:agent. Контроллеру не нужна новая ветка type→component: MessageProcessor использует component из updateComponents и зарегистрированный каталог. Доменная обработка новых событий при необходимости добавляется в обработчик onAction.
