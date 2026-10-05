# Переносимый модуль A2UI · 0.4.0

Протокол: A2UI v0.9. Каталог: `urn:kxnzee:a2ui:cards:v2`.

Копируйте весь `src/a2ui` в своё React-приложение. Зависимости: `@a2ui/react` и `@a2ui/web_core` 0.12.0, Zod 3.25.76, AntD 6.6.5, React/ReactDOM 18.2 или 19. Для AntD 5 адаптируйте Space.orientation в catalog.tsx; эта версия здесь не проверялась.

| Файл | Назначение |
| --- | --- |
| catalog.tsx | Схемы и AntD-компоненты через createComponentImplementation, регистрация Catalog |
| processor.ts | Создание стандартного MessageProcessor с каталогом и callback действия |
| A2uiView.tsx | Подписки onSurfaceCreated/onSurfaceDeleted и рендер A2uiSurface |
| useA2ui.ts | Lifecycle processor и подключение текстового декодера |
| stream.ts | Обрамление `<a2ui>` для выбранного смешанного текстового транспорта |
| agent.ts | Экспорт каталога, схемы протокола, capabilities и инструкций модели |

Официальный подход: [React renderer README](https://github.com/a2ui-project/a2ui/blob/main/renderers/react/README.md) и [протокол v0.9](https://a2ui.org/specification/v0.9-a2ui/). Реализация проверяется с закреплённым SDK 0.12.0. Обработку сообщений, state поверхностей, binding и формирование действий выполняет SDK. Собственного контроллера, store или менеджера отправки карточек нет.

## Подключение к вашему запросу

```tsx
import { useA2ui, A2uiView } from './features/a2ui';

const a2ui = useA2ui({
  onAction: message => existingSendToAgent(message),
});
const response = a2ui.beginResponse({
  onText: appendVisibleText,
  onError: showChatError,
});
// Stream: onTextDelta → response.push, onDone → response.finish.
// POST: response.push(assistant.content); response.finish().
// Отмена или ошибка транспорта: response.cancel().

<A2uiView processor={a2ui.processor} />
```

`useA2ui` возвращает `{processor, beginResponse, clear}`. processor — экземпляр SDK MessageProcessor; beginResponse подключает текстовые callbacks текущего ответа; clear сбрасывает поверхности диалога.

Если транспорт отдаёт JSON A2UI отдельно, передавайте его прямо в SDK: `a2ui.processor.processMessages(messageOrArray)`. Декодер тогда не нужен. Нативный processMessages принимает как одно сообщение, так и массив сообщений протокола; массив истории чата `{role, content}` ему не передаётся.

Хук не отправляет запрос, не хранит историю и не управляет статусом отправки. onAction получает стандартное `{version, action}` с context, разрешённым SDK. Ошибки запроса, loading, повтор и серверную идемпотентность обрабатывает ваш чат. Для блокировки вариантов приложение может обновить необязательный disabled через updateDataModel; пример есть в src/demo/main.tsx. Компонент не меняет disabled самостоятельно.

beginResponse отменяет предыдущий декодер; поздние дельты игнорируются. clear отменяет декодер и удаляет поверхности стандартными deleteSurface, но не отменяет HTTP. При unmount processor освобождается; cleanup совместим с React StrictMode. Для смены диалога используйте компонент с key={conversationId}.

## Компоненты и агент

ClarificationCard: question, options, selected, onSelect, необязательный disabled. selected — writable binding к абсолютному пути data model. При клике React вызывает setSelected(option.id), затем onSelect(). SDK подставляет выбор в context действия. questionId находится в context события, отдельного дублирующего свойства карточки нет. MetricCard: title, числовой value, необязательный unit.

getAgentConfiguration возвращает catalogSchema, protocolSchema, capabilities и instructions. Передайте их существующей интеграции модели. Реестр React сам не меняет prompt. Добавляя компонент, определите Zod-схему с description, реализацию createComponentImplementation и включите её в Catalog. Затем повторите export:agent.

Примеры находятся в src/demo/messages.ts; скрипт export:agent сохраняет их отдельно в dist/agent/examples.json. Они не входят в UI-модуль. Переносите весь dist/agent для локального разрешения ссылок SDK-схем. capabilities содержит catalogId, полная схема передаётся отдельно; запрос в интернет по URI каталога не нужен.

JSON Schema не сериализует все Zod refinements (например, уникальность ID вариантов и обязательность writable selected). SDK также предупреждает об упрощении рекурсивных expression-типов. Runtime проверяет исходные схемы; каталог не гарантирует, что LLM всегда выдаёт валидный ответ или достоверное число.

## Транспорт и валидация

В каждом `<a2ui>JSON</a2ui>` — одно стандартное сообщение v0.9: createSurface, updateComponents, updateDataModel или deleteSurface. Теги являются выбранным обрамлением текста, не частью спецификации A2UI. Сетевой адаптер декодирует UTF-8/SSE/JSON и передаёт только текстовые дельты. Сохраняйте исходный assistant.content с блоками в истории; видимый текст берите из onText.

SDK валидирует протокол, свойства и topology с STRICT_VALIDATION. Последовательность не атомарна: ошибка не откатывает ранее принятые сообщения. Поверхности и data bindings обновляет SDK; renderer подписывается на них сам.

## Изменение API в 0.4

Собственный A2uiController удалён. Вместо createA2uiController используйте createA2uiProcessor; хук возвращает processor вместо controller. У A2uiView prop называется processor. Единственный метод SDK для объекта или массива — processMessages. Поля questionId, answered и error убраны из ClarificationCard; questionId остаётся в context события, статус отправки принадлежит чату. ID каталога обновлён до urn:kxnzee:a2ui:cards:v2. Сгенерируйте dist/agent заново вместе с обновлением фронта.
