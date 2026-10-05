# A2UI v0.9: React + Ant Design + существующий стрим агента

UI-only пример с двумя зарегистрированными компонентами: **ClarificationCard** для уточнения с вариантами и **MetricCard** для числового показателя. Агент выдаёт стандартные сообщения A2UI; официальный MessageProcessor валидирует их по единому каталогу и рендерит через @a2ui/react. Сервер, запрос к DeepSeek и транспорт не добавлены.

## Перенос в ваш готовый UI и чат

Копируйте **только [`src/a2ui`](src/a2ui)**. [Карта файлов и API](src/a2ui/README.md), [подключение с импортами](docs/integration.md).

| Каталог | Назначение |
| --- | --- |
| src/a2ui | Переносимый модуль, хук useA2ui, каталог и экспорт конфигурации агента |
| src/example | Необязательный компилируемый адаптер существующего запроса |
| src/demo | Эмулятор чата/стрима, для переноса не нужен |

```tsx
const a2ui = useA2ui({ onAction: message => yourExistingSend(message) });
const response = a2ui.beginResponse({ onText: yourAppendText, onError: yourShowError });
// callbacks вашего стрима: response.push / finish / cancel
// В вашем UI: <A2uiView controller={a2ui.controller} />
```

Поддержаны оба режима: HTTP chunked с текстовыми дельтами и полный POST-ответ с assistant.content. Массив messages истории остаётся вашему чату.

`onAction` получает стандартное `{version, action}`. Схемы/инструкции агенту экспортируются из Catalog и SDK через getAgentConfiguration(). Регистрация на фронте не доставляет их модели автоматически; подключите конфигурацию в существующей интеграции.

## Проверить демо

Node.js 24 и npm:

```bash
npm ci
npm run dev
```

Откройте URL Vite. «Запустить» выдаёт текст и стандартные сообщения для уточнения, после выбора — метрику с явно тестовыми цифрами. Чанки по одному символу. Можно включить ошибку отправки, выбрать вариант, выключить ошибку и повторить. Демо не вызывает реального агента.

```bash
npm run check
```

Проверяет TypeScript, тесты протокола/каталога/действий/lifecycle, обе production-сборки и экспорт конфигурации агента.

## Что идёт в стриме

```text
Вот показатель.
<a2ui>{"version":"v0.9","createSurface":{"surfaceId":"result","catalogId":"urn:kxnzee:a2ui:cards:v1"}}</a2ui>
<a2ui>{"version":"v0.9","updateComponents":{"surfaceId":"result","components":[{"id":"root","component":"MetricCard","title":"Выручка","value":1250000,"unit":"₽"}]}}</a2ui>
```

Внутри каждого блока одно стандартное сообщение. Теги `<a2ui>` — только обрамление смешанного текстового транспорта, не спецификация A2UI. Собственный `{type, props}` удалён. Если транспорт уже отдаёт отдельные A2UI-объекты, передавайте их в controller.processMessage напрямую без тегов/декодера.

Поддерживаются createSurface, updateComponents, updateDataModel, deleteSurface и несколько поверхностей. Ошибка сообщения не откатывает предыдущие принятые сообщения. SDK проверяет структуры и свойства, но не достоверность цифр; гарантировать валидный ответ LLM одной схемой нельзя.

## Закрытый контур

```bash
npm run build
npm run package:a2ui
npm run package:demo
```

- `releases/a2ui-source.tar.gz` — только переносимые исходники с инструкцией; зависимости подготовьте во внутреннем registry/кэше.
- `dist/agent` — схемы, capabilities, инструкции и примеры для вашей интеграции локальной модели. Чтение JSON-файлов не требует React/Node.js на backend. Экспорт отдельно: `npm run export:agent`.
- `releases/a2ui-clarification-demo.tar.gz` — готовое автономное демо для внутреннего HTTP-сервера. Node.js/npm/интернет при запуске не нужны. Можно просто перенести dist/demo.

Архивы сопровождаются SHA256; упаковка требует tar. Для демо используйте HTTP, не file://. npm-зависимости не входят в исходный архив. Сборка внутри контура требует подготовленного npm registry/кэша с платформенными пакетами Vite. В CI доступны отдельные артефакты исходников, демо и конфигурации агента.

## Локальный npm-пакет

```bash
npm run build
npm pack
# В вашем приложении:
npm install /path/to/kxnzee-a2ui-clarification-ui-0.3.0.tgz
```

Пакет не опубликован в npm. React и ReactDOM предоставляет приложение. Версии AntD 5 потребуют адаптации catalog.tsx; пример проверяется с AntD 6.6.5. Миграция предыдущего собственного контракта описана в README модуля.
