# Переносимый модуль A2UI

**Копируйте весь этот каталог** в своё React-приложение, например в `src/features/a2ui`. Демо, пример чата, Vite-конфиги и scripts переносить не нужно. Публичный вход — `index.ts`.

| Файл | Ответственность |
| --- | --- |
| `useA2ui.ts` | React lifecycle, подключение чанков, отмена старого декодера, очистка |
| `ClarificationSurface.tsx` | Только рендер поверхности A2UI |
| `catalog.tsx` | Регистрация `ClarificationCard`, AntD-разметка |
| `controller.ts` | Сообщения A2UI, состояние карточки, событие выбора |
| `stream.ts` | Извлечение проверенного JSON из текстовых дельт |
| `contract.ts` | Zod-схема, тип ответа, инструкции для модели |
| `index.ts` | Публичные экспорты |

Модуль импортирует только свои файлы и npm-зависимости. Нет fetch, URL агента, импорта чата, истории сообщений, роутинга или конфигурации приложения. Используется существующий React/ReactDOM и ваш AntD ConfigProvider.

Зависимости: `@a2ui/react@0.12.0`, `@a2ui/web_core@0.12.0`, `zod@3.25.76`, `antd@6.6.5`; React/ReactDOM 18.2 или 19. Если у вас AntD 5, адаптируйте разметку только в `catalog.tsx`: `Space.orientation` → `direction`, `Alert.title` → `message`. AntD 5 в этом репозитории не проверялся. Зависимости должны быть доступны из внутреннего registry/кэша. Исходники не включают npm-пакеты.

```tsx
import { useA2ui, ClarificationSurface } from './features/a2ui';

// В компоненте существующего чата:
const a2ui = useA2ui({
  onAnswer: answer => existingSendAnswer(answer), // Promise принятия ответа
});

// Перед каждым ответом агента:
const response = a2ui.beginResponse({
  onText: delta => appendToExistingMessage(delta),
  onError: error => showExistingChatError(error.message),
});

// В callbacks уже подключённого транспорта:
// onTextDelta → response.push(delta)
// onDone      → response.finish()
// onCancel / onError → response.cancel()

// В разметке существующего чата:
<ClarificationSurface controller={a2ui.controller} />
```

Не вызывайте `beginResponse` при каждом рендере: один раз перед ответом агента. Новому ответу нужен новый `response`; старый автоматически отменяется. `push` принимает уже декодированные текстовые дельты, а не SSE-конверты, байты или накопленный текст. Обычный текст выводите из `onText`, чтобы служебный JSON не появлялся в чате.

`a2ui.clear()` отменяет декодер и убирает карточку; используйте для сброса диалога. Это не отменяет сетевой запрос — отмена транспорта остаётся приложению. Для разных диалогов используйте отдельные экземпляры хука (например, компонент с `key={conversationId}`). При unmount хук отменяет декодер и закрывает контроллер; поздние чанки отменённых/завершённых ответов игнорируются. `onAnswer` использует актуальный callback после rerender.

Для передачи локальной модели экспортирован `CLARIFICATION_INSTRUCTIONS`. Ваша интеграция добавляет его в prompt. Ожидаемый блок:

```text
Уточню один момент.
<clarification>{"questionId":"metric-1","question":"Что показать?","options":[{"id":"revenue","label":"Выручка"},{"id":"orders","label":"Заказы"}]}</clarification>
```

Карточка появится после полного блока и успешной проверки схемы. На клике `onAnswer` получает `{type: 'clarification_answer', questionId, optionId, label}`. Callback должен вернуть Promise, который отклоняется при ошибке отправки: UI разблокирует варианты для повтора. Ваш транспорт может отправлять весь объект или превращать его в текст. Новый вопрос должен иметь новый questionId. Теги — локальный контракт поверх текста, а не стандарт протокола A2UI.
