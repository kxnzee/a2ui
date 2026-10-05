# Переносимый модуль A2UI · 0.5.0

Протокол: A2UI v0.9. Каталог: `urn:kxnzee:a2ui:cards:v2`.

Копируйте весь `src/a2ui` в своё React-приложение. Основные зависимости: `@a2ui/react` 0.9.1, `@a2ui/web_core` 0.11.0, Zod 4.6.5, AntD 5.22.5, React/ReactDOM 18.2 или 19. Каталог A2UI использует отдельный alias `zod-a2ui` → Zod 3.25.76, необходимый для API этих версий SDK.

| Файл | Назначение |
| --- | --- |
| catalog.tsx | Схемы и AntD-компоненты через createComponentImplementation, регистрация Catalog |
| processor.ts | Создание стандартного MessageProcessor с каталогом и callback действия |
| A2uiView.tsx | Подписки onSurfaceCreated/onSurfaceDeleted и рендер A2uiSurface |
| useA2ui.ts | Lifecycle processor и подключение текстового декодера |
| stream.ts | Обрамление `<a2ui>` для выбранного смешанного текстового транспорта |
| agent.ts | Экспорт каталога, схемы протокола, capabilities и инструкций модели |
| index.ts | Публичные экспорты модуля |

Официальный подход: [React renderer README](https://github.com/a2ui-project/a2ui/blob/main/renderers/react/README.md) и [протокол v0.9](https://a2ui.org/specification/v0.9-a2ui/). Реализация проверяется с закреплённым `@a2ui/react` 0.9.1 и `@a2ui/web_core` 0.11.0. Обработку сообщений, state поверхностей, binding и формирование действий выполняет SDK. Собственного контроллера, store или менеджера отправки карточек нет.

## Подключение к вашему запросу

```tsx
import { useA2ui, A2uiView } from './features/a2ui';

const a2ui = useA2ui({
  onAction: message => existingSendToAgent(message),
});
// Вызывайте при начале ответа агента, а не во время рендера.
function beginAgentReply() {
  return a2ui.beginResponse({
    onText: appendVisibleText,
    onError: showChatError,
  });
}
// Stream: onTextDelta → response.push, onDone → response.finish.
// POST: response.push(assistant.content); response.finish().
// Отмена или ошибка транспорта: response.cancel().

<A2uiView processor={a2ui.processor} />
```

`useA2ui` возвращает `{processor, beginResponse, clear}`. processor — экземпляр SDK MessageProcessor; beginResponse подключает текстовые callbacks текущего ответа; clear сбрасывает поверхности диалога.

Если транспорт отдаёт JSON A2UI отдельно, передавайте его прямо в SDK: `a2ui.processor.processMessages(messages)`. Декодер тогда не нужен. В web_core 0.11 processMessages принимает массив сообщений протокола: для одного объекта передайте [message]; массив истории чата `{role, content}` ему не передаётся.

Хук не отправляет запрос, не хранит историю и не управляет статусом отправки. onAction получает стандартное `{version, action}` с context, разрешённым SDK. Ошибки запроса, loading, повтор и серверную идемпотентность обрабатывает ваш чат. Для блокировки вариантов приложение может обновить необязательный disabled через updateDataModel; пример есть в src/demo/main.tsx. Компонент не меняет disabled самостоятельно.

beginResponse отменяет предыдущий декодер; поздние дельты игнорируются. clear отменяет декодер и удаляет поверхности стандартными deleteSurface, но не отменяет HTTP. При unmount processor освобождается; cleanup совместим с React StrictMode. Для смены диалога используйте компонент с key={conversationId}.

## Компоненты и агент

ClarificationCard: question, options, selected, onSelect, необязательный disabled. selected — writable binding к абсолютному пути data model. При клике React вызывает setSelected(option.id), затем onSelect(). SDK подставляет выбор в context действия. questionId находится в context события, отдельного дублирующего свойства карточки нет. MetricCard: title, числовой value, необязательный unit.

getAgentConfiguration возвращает catalogSchema, protocolSchema, capabilities и instructions. Передайте их существующей интеграции модели. Реестр React сам не меняет prompt. Добавляя компонент, определите Zod-схему с description, реализацию createComponentImplementation и включите её в Catalog. Затем повторите export:agent.

Примеры находятся в src/demo/messages.ts; скрипт export:agent сохраняет их отдельно в dist/agent/examples.json. Они не входят в UI-модуль. Скрипт также формирует catalog.json с $defs.anyComponent, $defs.anyFunction и $defs.theme из того же inline-каталога SDK. Это файл подключения к ссылкам протокола, а catalogSchema.json содержит исходный inline-каталог. Переносите весь dist/agent для локального разрешения ссылок SDK-схем. capabilities содержит catalogId; запрос в интернет по URI каталога не нужен.

JSON Schema не сериализует все Zod refinements (например, уникальность ID вариантов и обязательность writable selected). Runtime проверяет исходные схемы; каталог не гарантирует, что LLM всегда выдаёт валидный ответ или достоверное число.

## Транспорт и валидация

В каждом `<a2ui>JSON</a2ui>` — одно стандартное сообщение v0.9: createSurface, updateComponents, updateDataModel или deleteSurface. Теги являются выбранным обрамлением текста, не частью спецификации A2UI. Сетевой адаптер декодирует UTF-8/SSE/JSON и передаёт только текстовые дельты. Сохраняйте исходный assistant.content с блоками в истории; видимый текст берите из onText.

Декодер проверяет конверт схемой A2uiMessageSchema SDK, processor проверяет свойства зарегистрированных компонентов. В web_core 0.11 нет STRICT_VALIDATION. Для JSON-ответов вне декодера проверяйте массив через A2uiMessageListSchema.parse перед processMessages. Неизвестный тип компонента SDK отображает как Unknown component, а не отклоняет на входе. Последовательность не атомарна: ошибка не откатывает ранее принятые сообщения. Поверхности и data bindings обновляет SDK; renderer подписывается на них сам.

Ошибки JSON/конверта и ошибки обработки сообщения SDK передаются в onError отдельно; исходная ошибка доступна в error.cause. Без onError декодер выбрасывает ошибку — обработайте её в своём запросе. После ошибки отдельного блока обработка следующих блоков продолжается, если callback не отменил response. Незавершённый блок обнаруживается в finish. Блок длиннее 32 768 символов останавливает декодер до конца текущего ответа. cancel/clear из callback останавливает также остаток текущего чанка.

## Изменение API в 0.5

Собственный A2uiController удалён. Используйте createA2uiProcessor; хук возвращает processor вместо controller. У A2uiView prop называется processor. В web_core 0.11 processMessages принимает массив; один объект передаётся как [message]. Поля questionId, answered и error убраны из ClarificationCard; questionId остаётся в context события, статус отправки принадлежит чату. ID каталога обновлён до urn:kxnzee:a2ui:cards:v2. Сгенерируйте dist/agent заново вместе с обновлением фронта.


## SDK 0.11: актуальные обращения

```ts
processor.processMessages([message]);
processor.processMessages(messages);
processor.model.getSurface(surfaceId);
processor.model.surfacesMap;
processor.model.dispose();
```

Конфигурация экспортируется через getClientCapabilities({version: 'v0.9', includeInlineCatalogs: true}). SDK генерирует inline-каталог; getAgentConfiguration возвращает его отдельно как catalogSchema и сохраняет description исходных схем. CATALOG_INSTRUCTIONS остаётся рядом с регистрацией в catalog.tsx: эта версия Catalog не имеет свойства instructions. Для переноса используйте зависимости и override из docs/integration.md; alias zod-a2ui и override ядра нужны также в вашем приложении.


## package.json приложения при переносе исходников

```json
{
  "dependencies": {
    "@a2ui/react": "0.9.1",
    "@a2ui/web_core": "0.11.0",
    "antd": "5.22.5",
    "zod": "4.6.5",
    "zod-a2ui": "npm:zod@3.25.76"
  },
  "overrides": {
    "@a2ui/web_core": "0.11.0"
  }
}
```

Объедините эти записи со своим корневым package.json и обновите lockfile. Override закрепляет единую копию ядра для renderer и приложения; npm не наследует overrides из зависимого npm-пакета. Во внутреннем registry/кэше понадобятся оба пакета Zod: основной 4.6.5 и Zod 3.25.76 для SDK/alias. Для Ant Design 5 используются Space.direction и Alert.message.
