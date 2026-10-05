# A2UI для готового React/AntD-чата · 0.5.0

Протокол A2UI v0.9, `@a2ui/react` 0.9.1 и `@a2ui/web_core` 0.11.0, каталог `urn:kxnzee:a2ui:cards:v2`. Два зарегистрированных компонента: **ClarificationCard** для уточнения с вариантами и **MetricCard** для числового показателя. Агент выдаёт стандартные сообщения A2UI; официальный MessageProcessor валидирует их по единому каталогу и рендерит через @a2ui/react. Сервер, запрос к DeepSeek и транспорт не добавлены.

## Перенос в ваш готовый UI и чат

Копируйте **только [`src/a2ui`](src/a2ui)**. [Карта файлов и API](src/a2ui/README.md), [подключение с импортами](docs/integration.md).

| Каталог | Назначение |
| --- | --- |
| src/a2ui | Переносимый модуль, хук useA2ui, каталог и экспорт конфигурации агента |
| src/example | Необязательный компилируемый адаптер существующего запроса |
| src/demo | Эмулятор чата/стрима, для переноса не нужен |

```tsx
import { useA2ui, A2uiView } from './features/a2ui';

// Внутри вашего компонента чата:
const a2ui = useA2ui({ onAction: message => yourExistingSend(message) });

// Вызывайте при начале каждого ответа, а не во время рендера:
function beginAgentReply() {
  return a2ui.beginResponse({ onText: yourAppendText, onError: yourShowError });
}
// Stream: response.push(delta) → response.finish().
// POST: response.push(assistant.content) → response.finish().
// При ошибке/отмене: response.cancel().
// В разметке: <A2uiView processor={a2ui.processor} />
```

Поддержаны оба режима: HTTP chunked с текстовыми дельтами и полный POST-ответ с assistant.content. Готовые JSON-сообщения: `a2ui.processor.processMessages(messages)`. Историю `messages`, loading, ошибки отправки и повтор ведёт ваш чат.

`onAction` получает стандартное `{version, action}`. Схемы/инструкции агенту экспортируются из Catalog и SDK через getAgentConfiguration(). Регистрация на фронте не доставляет их модели автоматически; подключите конфигурацию в существующей интеграции.

## Совместимость зависимостей

У @a2ui/react 0.9.1 зависимость web_core ^0.9.2 и Zod 3. В корневом package.json закреплён override web_core 0.11.0, чтобы renderer и приложение использовали одну копию ядра. Для схем каталога используется alias zod-a2ui → Zod 3.25.76; основной zod остаётся 4.6.5. Такая комбинация проверяется тестами и сборкой.

При копировании исходников перенесите [зависимости и override](docs/integration.md#зависимости-в-приложении) в корневой package.json вашего приложения. При установке npm-архива override также задаётся в приложении: npm не наследует overrides зависимого пакета.

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

Проверяет TypeScript, тесты протокола/каталога/действий/lifecycle и обоих режимов запроса, обе production-сборки и экспорт конфигурации агента.

## Что идёт в стриме

```text
Вот показатель.
<a2ui>{"version":"v0.9","createSurface":{"surfaceId":"result","catalogId":"urn:kxnzee:a2ui:cards:v2"}}</a2ui>
<a2ui>{"version":"v0.9","updateComponents":{"surfaceId":"result","components":[{"id":"root","component":"MetricCard","title":"Выручка","value":1250000,"unit":"₽"}]}}</a2ui>
```

Внутри каждого блока одно стандартное сообщение. Теги `<a2ui>` — только обрамление смешанного текстового транспорта, не спецификация A2UI. Собственный `{type, props}` и контроллер не используются. Обработка и state принадлежат SDK. Если транспорт уже отдаёт отдельные A2UI-объекты, передавайте их в processor.processMessages напрямую без тегов/декодера.

Поддерживаются createSurface, updateComponents, updateDataModel, deleteSurface и несколько поверхностей. Ошибка сообщения не откатывает предыдущие принятые сообщения. Декодер проверяет конверт схемой SDK, processor проверяет свойства зарегистрированных компонентов, но не достоверность цифр; гарантировать валидный ответ LLM одной схемой нельзя.

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
npm install /path/to/kxnzee-a2ui-clarification-ui-0.5.0.tgz
```

Пакет не опубликован в npm. React и ReactDOM предоставляет приложение. Компоненты адаптированы и проверены с AntD 5.22.5. Изменения API 0.5 описаны в [README модуля](src/a2ui/README.md#изменение-api-в-05). При обновлении фронта повторите export:agent и замените конфигурацию модели вместе с каталогом.
