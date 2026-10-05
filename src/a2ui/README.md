# Переносимый модуль A2UI v0.9

Копируйте **весь этот каталог** в своё React-приложение, например в `src/features/a2ui`. Публичный вход — `index.ts`. Модуль использует официальный `@a2ui/react` и `@a2ui/web_core` 0.12.0, AntD 6.6.5, Zod 3.25.76, ваш React/ReactDOM 18.2 или 19 и ваш ConfigProvider. Зависимости подготовьте во внутреннем registry/кэше. Для AntD 5 адаптируйте `Space.orientation` и `Alert.title` в catalog.tsx; AntD 5 здесь не проверялся.

| Файл | Ответственность |
| --- | --- |
| `catalog.tsx` | Схемы, описания, React-реализации и инструкции одного стандартного Catalog |
| `agent.ts` | Экспорт catalogSchema, схемы протокола SDK, capabilities и примеров агенту |
| `stream.ts` | Только текстовое обрамление `<a2ui>` и проверка конверта схемой SDK |
| `controller.ts` | Прямая обработка стандартных сообщений MessageProcessor, отправка стандартных action |
| `A2uiView.tsx` | Рендер всех активных поверхностей через A2uiSurface |
| `useA2ui.ts` | Lifecycle React, отмена декодера, очистка |
| `contract.ts` | Схема вариантов нашего компонента и тип стандартного обратного сообщения |

Нет собственного `{type, props}`, таблицы перевода типов, сетевого клиента, URL агента, store чата или истории сообщений. Выбор компонента задаётся стандартным полем `component` в `updateComponents`.

## Подключение

```tsx
import { useA2ui, A2uiView } from './features/a2ui';

// В вашем компоненте чата:
const a2ui = useA2ui({
  onAction: message => existingSendToAgent(message), // Promise принятия сообщения
});

// Один раз перед каждым ответом агента:
const response = a2ui.beginResponse({
  onText: delta => appendToExistingMessage(delta),
  onError: error => showExistingChatError(error.message),
});
// callbacks вашего транспорта:
// onTextDelta → response.push(delta)
// onDone      → response.finish()
// onCancel / onError → response.cancel()

// В разметке чата:
<A2uiView controller={a2ui.controller} />
```

Хук не отправляет запрос. `onAction` должен отклонять Promise при ошибке отправки: ClarificationCard разблокирует варианты для повтора. Метрика не отправляет действий. Обычный текст берите только из `onText`, чтобы JSON не попадал в чат.

Новый `beginResponse` отменяет старый декодер, но не удаляет существующие поверхности: они принадлежат диалогу. Агент удаляет их через `deleteSurface`, либо приложение вызывает `a2ui.clear()`. Это отменяет декодер и удаляет все поверхности, но не отменяет сетевой запрос. Для разных диалогов используйте отдельные экземпляры хука, например компонент с `key={conversationId}`. При unmount контроллер закрывается; поздние чанки отменённых/завершённых ответов игнорируются. Актуальный onAction используется после rerender.

## Стандартные сообщения в текстовом стриме

Каждый блок содержит **одно** полное сообщение A2UI:

```text
Вот показатель.
<a2ui>{"version":"v0.9","createSurface":{"surfaceId":"result","catalogId":"urn:kxnzee:a2ui:cards:v1"}}</a2ui>
<a2ui>{"version":"v0.9","updateComponents":{"surfaceId":"result","components":[{"id":"root","component":"MetricCard","title":"Выручка","value":1250000,"unit":"₽"}]}}</a2ui>
```

`<a2ui>` — только локальная граница сообщений в смешанном текстовом стриме, не элемент спецификации. Если транспорт уже отдаёт JSON-сообщения A2UI отдельно, пропускайте декодер и вызывайте `a2ui.controller.processMessage(message)` напрямую.

Поддерживаются стандартные `createSurface`, `updateComponents`, `updateDataModel`, `deleteSurface`. Сначала создание поверхности, затем её данные/компоненты. Корневой компонент — `root`. Каждая поверхность рендерится отдельно. Не повторяйте createSurface для существующего ID; применяйте update или удаляйте и создавайте заново.

Конверт проверяет `A2uiMessageSchema` SDK. Свойства компонентов и topology проверяет `MessageProcessor` с нашим Catalog и STRICT_VALIDATION. Обработка последовательная: ошибка не откатывает ранее принятые сообщения. Data model может хранить произвольные JSON-данные; значения для bindings должны соответствовать типам компонента. Неверное сообщение возвращается через onError; достоверность числовых данных UI не проверяет.

## Стрим и обычный POST

Хук одинаков для обоих режимов. При HTTP chunked передавайте декодированные UTF-8 текстовые дельты в response.push, затем finish. При полном POST-ответе передайте весь assistant.content одним push, затем finish. Массив chat messages [{role, content}] формирует и хранит ваш чат; модуль его не принимает и не изменяет. Сохраняйте исходное assistant.content с блоками для истории агента, а для видимого текста используйте onText.

Для готового массива **сообщений протокола** вызовите controller.processMessages(array). Если в ответе только одно сообщение — processMessage(object). Это прямые entrypoints SDK; собственный JSON-конверт не нужен.

## Один каталог для фронта и агента

`getAgentConfiguration()` возвращает:

- `catalogSchema` из `a2uiCatalog.catalogSchema`;
- `protocolSchema` из `Schemas.A2uiMessageSchemaRaw` SDK;
- `capabilities` из `MessageProcessor.getRendererCapabilities`, включая supportedCatalogIds (схема передаётся отдельно, без inline-дублирования);
- `instructions` с правилами каталога и текстового обрамления;
- `examples` — стандартные сообщения для обеих карточек.

Вы передаёте эти данные локальной модели через существующую интеграцию. React-регистрация сама не доставляет каталог агенту. Назначение компонента хранится в description его схемы; общие правила — в Catalog.instructions. Добавляя компонент, изменяйте catalog.tsx и повторно экспортируйте конфигурацию. Схемы вручную отдельно от каталога не поддерживаются.

JSON Schema экспортирует структурные правила; некоторые Zod refinements (например, уникальность ID вариантов и обязательность writable binding в нашем компоненте) не сериализуются полностью. Поэтому инструкции также содержат эти ограничения, а фронт проверяет исходную Zod-схему. SDK предупреждает об упрощении рекурсивных типов выражений при экспорте. В каталоге нет исполняемых функций.

| Компонент | Когда агенту использовать |
| --- | --- |
| ClarificationCard | Нужен выбор пользователя для продолжения |
| MetricCard | Есть одно известное число; не придумывать данные |

## Стандартное обратное сообщение

После выбора SDK формирует действие; контроллер оборачивает его в стандартное сообщение клиента:

```json
{"version":"v0.9","action":{"name":"clarification_answer","surfaceId":"question","sourceComponentId":"root","timestamp":"2026-10-05T06:00:00.000Z","context":{"questionId":"metric-1","optionId":"orders"}}}
```

Ваш `onAction` отправляет его в тот же диалог. Если агент принимает только текст, сериализуйте JSON на границе вашей интеграции. Context определяется событием в сообщении агента. Для нашего ClarificationCard он содержит questionId и optionId; контроллер сверяет их с текущей карточкой, блокирует повторные клики и показывает ошибку/повтор.

## Миграция с версии 0.2

`<ui>{type, props}</ui>` удалён. Используйте `<a2ui>` со стандартными сообщениями. `onAnswer` заменён на `onAction`, собственный ClarificationAnswer — на A2uiActionMessage. Методы showComponent/showQuestion/showMetric удалены; используйте processMessage. A2UI_INSTRUCTIONS заменён на getAgentConfiguration(): инструкции берутся из каталога, схемы — из SDK. Хук подключения чанков и A2uiView сохранены.
