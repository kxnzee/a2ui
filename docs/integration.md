# Подключение A2UI 0.6.0 к существующему UI и чату

Переносите только [`src/a2ui`](../src/a2ui). [README модуля](../src/a2ui/README.md) содержит карту файлов, зависимости, стандартные сообщения и правила lifecycle. [`src/example/AgentChat.tsx`](../src/example/AgentChat.tsx) — компилируемый внешний адаптер вашего запроса, не новый HTTP-клиент.

## Фронт и запрос

```tsx
import { useA2ui, A2uiView, type A2uiActionMessage } from './features/a2ui';
import { cards } from './features/a2ui/cards'; // либо ваш каталог

// Внутри компонента чата:
const a2ui = useA2ui({
  catalogs: [cards.catalog],
  onAction: (message: A2uiActionMessage) => send(JSON.stringify(message)),
});

// Та же функция вызывается для пользовательского текста и действия карточки.
function send(content: string) {
  const messageId = createAssistantMessage();
  const response = a2ui.beginResponse({
    onText: delta => appendToMessage(messageId, delta),
    onError: error => setMessageError(messageId, error.message),
  });
  let raw = '';
  const request = existingStreamingRequest({
    messages: [...existingChatMessages, { role: 'user', content }],
    stream: true,
  }, {
    onTextDelta(delta: string) {
      raw += delta;
      response.push(delta);
    },
    onDone() {
      response.finish();
      saveRawAssistantContent(messageId, raw); // Вместе с A2UI-блоками.
    },
    onError(error: Error) {
      response.cancel();
      setMessageError(messageId, error.message);
    },
  });
  registerCancel(messageId, () => { response.cancel(); request.cancel(); });
  return request.accepted;
}

// В разметке существующего чата:
<A2uiView processor={a2ui.processor} />
```

Функции store и existingStreamingRequest выше обозначают ваши методы; existingChatMessages — текущая история, включая пользовательский текст, добавляемый при отправке. registerCancel регистрирует отмену вашего транспорта, request.accepted — Promise его принятия запроса (как в компилируемом примере). Эти имена не являются API A2UI: сопоставьте callbacks с текущим транспортом. Не создавайте response при рендере; один response на ответ агента. Создавайте его и для ответа после выбора варианта. Привяжите onText к конкретному сообщению вашего store. Ошибки отправки, loading и повтор выбора обрабатывает существующий чат; UI-модуль не меняет статус запроса.

`push` принимает уже извлечённые текстовые дельты, не SSE-конверты/байты/накопленный текст. Чат должен выводить обычный текст из onText вместо исходных чанков. История, Markdown, скролл, загрузка, запрос и отмена транспорта остаются вашему приложению. При сбросе диалога вызывайте clear; при смене диалога используйте отдельный экземпляр хука.

Если ваши события стрима уже содержат отдельное поле с JSON A2UI, вызывайте `a2ui.processor.processMessages([event.a2ui])` напрямую и продолжайте выводить текст своей интеграцией. Теги в этом варианте не нужны.

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
a2ui.processor.processMessages(a2uiProtocolMessages);
```

Этот массив содержит `{version, createSurface/updateComponents/…}`, а не `{role, content}`. Для массива chat messages сначала извлеките содержимое нужного assistant-сообщения своим адаптером. Пример обоих режимов с импортами и callbacks — `src/example/AgentChat.tsx` и `src/example/request.ts`.

У `AgentChat` передайте `send`, текущие `messages`, `onMessagesChange` (например, setter вашего store) и `stream`. Внешний адаптер сохраняет исходный assistant.content с A2UI-блоками через onMessagesChange, а на экран передаёт только onText. Для `stream: true` транспорт вызывает onTextDelta и onDone; для `stream: false` — onResponse с полным assistant.content. Эти режимы не смешиваются. `accepted` означает, что сообщение принято вашим транспортом; ошибку до принятия сообщайте через rejected Promise или onError. Отмена и ошибки завершают декодер и игнорируют поздние callbacks.

Исключения из вывода текста, финального flush и сохранения истории также завершают запрос через onError. Promise accepted подтверждает только принятие: ошибка во время последующего стрима сообщается через onError. AgentChat показывает её в одном месте, без повторного catch, который мог бы перезаписать состояние нового запроса.

## Передача каталога локальному агенту

```ts
import { getAgentConfiguration } from './features/a2ui';
import { cards } from './features/a2ui/cards';

const config = getAgentConfiguration(cards);
const systemPrompt = [
  yourExistingPrompt,
  config.instructions,
  `Каталог компонентов:\n${JSON.stringify(config.catalogSchema)}`,
  `Схема сообщений A2UI:\n${JSON.stringify(config.protocolSchema)}`,
].join('\n\n');
// Передайте systemPrompt вашей существующей интеграции модели.
// Если она поддерживает capabilities negotiation, передайте config.capabilities.
```

Не нужно регистрировать ещё один независимый JSON-контракт или поддерживать схемы в prompt вручную. Каталог и схемы берутся из SDK и единой регистрации компонентов. Модель выбирает `ClarificationCard` или `MetricCard` по их описанию и инструкциям каталога (cards.instructions). Сам React SDK не вызывает вашу модель и не меняет её prompt.

Если агент находится на отдельном backend без React/Node.js, заранее выполните:

```bash
npm run export:agent
```

Перенесите **весь `dist/agent`** в контур. Основные файлы: catalogSchema.json, catalog.json, protocolSchema.json, capabilities.json, instructions.txt, examples.json. Рядом скопированы оригинальные JSON-схемы из установленного SDK, включая common_types.json, для локального разрешения $ref. Backend читает эти файлы как данные; npm и React ему не нужны. URI catalogId идентифицирует каталог, но не требует запроса в интернет. Конфигурацию обновляйте вместе с версией фронта. capabilities содержит поддерживаемый catalogId; inline-каталог передаётся отдельно в catalogSchema.json. getAgentConfiguration возвращает независимые копии схем.

catalog.json генерируется из того же inline-каталога и добавляет определения anyComponent, anyFunction и theme для стандартных ссылок протокола. В JSON Schema resolver зарегистрируйте локальные файлы по их $id, включая catalog.json под https://a2ui.org/specification/v0_9/catalog.json. Этот $id — адрес подключения схемы; идентификатор самого UI-каталога остаётся urn:a2ui:cards:v1. Сетевые запросы для разрешения ссылок не нужны. Meta-schema Draft 2020-12 предоставляет ваш JSON Schema валидатор. После успешного формирования конфигурации export:agent очищает ранее сгенерированный dist/agent, чтобы старые схемы не оставались в комплекте.

## Ответ агента

Обычный текст и два стандартных сообщения:

```text
Вот показатель.
<a2ui>{"version":"v0.9","createSurface":{"surfaceId":"result","catalogId":"urn:a2ui:cards:v1"}}</a2ui>
<a2ui>{"version":"v0.9","updateComponents":{"surfaceId":"result","components":[{"id":"root","component":"MetricCard","title":"Выручка","value":1250000,"unit":"₽"}]}}</a2ui>
```

Для ClarificationCard сначала создаётся поверхность, затем начальное значение выбранного варианта и карточка:

<!-- clarification-example -->
```json
[
  {
    "version": "v0.9",
    "createSurface": {
      "surfaceId": "question",
      "catalogId": "urn:a2ui:cards:v1"
    }
  },
  {
    "version": "v0.9",
    "updateDataModel": {
      "surfaceId": "question",
      "path": "/",
      "value": {
        "selected": "",
        "disabled": false
      }
    }
  },
  {
    "version": "v0.9",
    "updateComponents": {
      "surfaceId": "question",
      "components": [
        {
          "id": "root",
          "component": "ClarificationCard",
          "question": "Какой показатель показать?",
          "options": [
            {
              "id": "revenue",
              "label": "Выручка"
            },
            {
              "id": "orders",
              "label": "Количество заказов"
            }
          ],
          "selected": {
            "path": "/selected"
          },
          "disabled": {
            "path": "/disabled"
          },
          "onSelect": {
            "event": {
              "name": "clarification_answer",
              "context": {
                "optionId": {
                  "path": "/selected"
                }
              }
            }
          }
        }
      ]
    }
  }
]
```
<!-- /clarification-example -->

Это массив стандартных сообщений A2UI. Для прямого JSON-ответа передайте его в processor.processMessages. Для смешанного текста обрамляйте **каждый объект отдельно** в `<a2ui>…</a2ui>`. В context события передаётся optionId, вопрос определяют surfaceId и sourceComponentId действия; у карточки есть question, options, selected, onSelect и необязательный disabled.

Полные примеры находятся в src/demo/messages.ts. Скрипт export:agent сохраняет examples.json отдельно; backend может добавить его к prompt. Модуль getAgentConfiguration возвращает схемы и инструкции без примеров.

Декодер передаёт стандартное сообщение в MessageProcessor без преобразования. Декодер проверяет конверт схемой SDK; processor проверяет свойства зарегистрированных компонентов; A2uiView рендерит все активные поверхности. Новое сообщение может обновить карточку или её данные, а не обязательно заменить всю поверхность. Для удаления агент выдаёт deleteSurface.

onError получает ошибки JSON/конверта и ошибки обработки SDK; исходная ошибка находится в error.cause. Если onError не задан, ошибка выбрасывается в push/finish. При обработанной ошибке отдельного блока декодер продолжает читать следующий блок; callback может вызвать response.cancel или a2ui.clear, чтобы остановить также остаток текущего чанка. Незавершённый блок обнаруживается в finish, а блок длиннее maxBlockLength (по умолчанию 32 768 символов) отбрасывается с ошибкой, и разбор ответа продолжается.

`<a2ui>` только отделяет JSON от текста: это выбранное обрамление вашего текстового транспорта, не часть стандарта A2UI. Модель должна соблюдать формат; строгая JSON-генерация и повтор при ошибке настраиваются в вашей интеграции. Схемы и проверка UI не гарантируют, что LLM всегда сформирует валидный ответ.

## Нажатие пользователя

`onAction` получает стандартное клиентское сообщение `{version: 'v0.9', action: {name, surfaceId, sourceComponentId, timestamp, context}}`. В нашем примере name — clarification_answer, context содержит optionId. Отправляйте полный объект либо JSON-строку в тот же диалог. Следующий ответ агента обрабатывается новым response. Если нужно блокировать варианты, приложение обновляет disabled через стандартный updateDataModel и снимает блокировку при ошибке. Например, для binding disabled: {path: "/disabled"} приложение передаёт `{version: "v0.9", updateDataModel: {surfaceId: "question", path: "/disabled", value: true}}` перед отправкой и false при ошибке. Пример расположен в src/demo/main.tsx; модуль не управляет отправкой. Серверную идемпотентность обеспечивает ваше приложение.

## Добавление компонентов

В cards.tsx (или в своём файле с каталогом, см. раздел «Свой каталог» в src/a2ui/README.md) добавьте Zod-схему с description, React-реализацию через createComponentImplementation и регистрацию в Catalog. Инструкции модели передаются вместе с каталогом как `{catalog, instructions}`. Затем повторите export:agent. Дополнительный контроллер не нужен: MessageProcessor использует component из updateComponents и зарегистрированный каталог. Доменная обработка новых событий при необходимости добавляется в обработчик onAction.


## Какие файлы переносить

| Куда | Что перенести |
| --- | --- |
| Ваш React UI | Весь src/a2ui, либо локальный npm-пакет 0.6.0 |
| Интеграция локального агента | Весь dist/agent после npm run export:agent |
| Внутренний npm registry/кэш | Зависимости из package.json с закреплёнными версиями |

src/demo и src/example нужны для проверки и знакомства с подключением. Для переноса UI-модуля достаточно src/a2ui. При переходе с предыдущего варианта замените controller на processor, используйте processMessages и обновите конфигурацию агента для cards:v2. Поля answered/error и отдельный questionId в свойствах карточки больше не используются.


## Зависимости в приложении

```json
{
  "dependencies": {
    "@a2ui/react": "0.9.1",
    "@a2ui/web_core": "0.11.0",
    "antd": "5.22.5",
    "zod-a2ui": "npm:zod@3.25.76"
  },
  "overrides": {
    "@a2ui/web_core": "$@a2ui/web_core"
  }
}
```

Запись `antd` нужна только для готовых карточек (`cards.tsx`); для своего каталога на другой дизайн-системе её не добавляйте. Основной Zod 4 модуль не использует. Добавьте эти записи в корневой package.json, сохранив свои React/ReactDOM и остальные зависимости. npm ci использует lockfile проекта; при первом подключении обновите свой lockfile через npm install. Во внутреннем registry/кэше подготовьте также Zod 3.25.76 — он требуется SDK и alias каталога. Каталоги импортируют z из zod-a2ui; основной Zod приложения остаётся независимым.

В web_core 0.11 нативный processMessages принимает массив: processMessages([message]) для одного сообщения. Поверхности доступны через processor.model.getSurface и processor.model.surfacesMap, cleanup выполняет processor.model.dispose. Схема каталога экспортируется нативным getClientCapabilities, инструкции модели передаются вместе с каталогом (`{catalog, instructions}`).


Если устанавливаете только npm-архив, а web_core не является прямой зависимостью вашего приложения, используйте корневой override с конкретной версией: `"@a2ui/web_core": "0.11.0"`. Запись `$@a2ui/web_core` подходит, когда корневая dependencies уже содержит web_core 0.11.0, как в примере выше. Это исключает вторую копию ядра 0.9.2 внутри React renderer.
