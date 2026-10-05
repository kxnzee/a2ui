# Подключение к уже готовому UI и чату

Переносите **только [`src/a2ui`](../src/a2ui)**. Полная карта файлов, зависимости и API находятся в [README модуля](../src/a2ui/README.md). [`src/example/AgentChat.tsx`](../src/example/AgentChat.tsx) — компилируемый пример внешнего адаптера; копировать его необязательно. [`src/demo`](../src/demo) — только демонстрация с эмуляцией стрима.

## 1. Подключить хук в вашем компоненте чата

```tsx
import {
  useA2ui,
  A2uiView,
  type ClarificationAnswer,
} from './features/a2ui';

const a2ui = useA2ui({
  onAnswer: async (answer: ClarificationAnswer) => {
    // Ваша существующая отправка в тот же диалог.
    // Если запрос принимает только текст, адаптируйте answer здесь.
    await existingSendAnswer(answer);
  },
});
```

Хук не отправляет запрос. Его `onAnswer` только вызывает ваш callback; возвращаемый Promise определяет успех/ошибку отправки для карточки.

## 2. Перед запросом создать декодер ответа

```tsx
const response = a2ui.beginResponse({
  onText: delta => appendToMessage(messageId, delta), // Ваш store чата.
  onError: error => setMessageError(messageId, error.message),
});
```

Создавайте `response` один раз перед каждым ответом агента, включая ответ после выбора варианта. Привяжите callbacks к конкретному сообщению. Когда начинается следующий ответ, старый декодер автоматически отменяется. Модуль поддерживает один активный ответ на экземпляр хука.

## 3. Подключить существующий стрим

```tsx
// В вашей существующей интеграции:
const request = existingStreamingRequest(input, {
  onTextDelta: response.push,
  onDone: response.finish,
  onError: error => {
    response.cancel();
    setMessageError(messageId, error.message);
  },
});

// При пользовательской отмене:
response.cancel();
request.cancel();
```

Имена callbacks адаптируйте к вашему транспорту. Здесь принимаются уже извлечённые строковые дельты. Для отмены/ошибки транспорта вызовите `cancel`; для нормального окончания — `finish`. Ошибка отправки ответа также должна отклонять Promise в `onAnswer`: одного транспортного callback `onError` недостаточно для повтора в карточке.

Если ваш UI уже отображает все исходные чанки, переключите именно текст сообщения на `onText` декодера. Иначе в чате будет виден служебный JSON. История, markdown, загрузка, скролл, запрос и сетевые ошибки принадлежат вашему чату.

## 4. Добавить поверхность в существующую разметку

```tsx
<YourExistingMessageList />
<A2uiView controller={a2ui.controller} />
<YourExistingComposer />
```

`YourExisting…` обозначают ваши компоненты; модуль не заменяет их. Поверхность показывает текущую карточку; историю карточек пример не сохраняет. При сбросе диалога вызовите `a2ui.clear()`. При смене диалога размонтируйте компонент хука (например, через `key={conversationId}`) или явно отмените транспорт и очистите модуль. Транспорт отменяет приложение; хук отменяет только декодер.

## 5. Контракт для локального агента

```ts
import { A2UI_INSTRUCTIONS } from './features/a2ui';
const systemPrompt = `${yourExistingPrompt}\n\n${A2UI_INSTRUCTIONS}`;
```

Интернет модели не нужен. Добавьте строку к инструкциям в существующей интеграции. Модель должна выдавать `<ui>JSON</ui>` с полями `type`, `props`. Для `type: "clarification"` props содержат `questionId`, `question`, `options`; для `type: "metric"` — `title`, числовой `value` и необязательный `unit`. Пример и ограничения есть в `src/a2ui/README.md`, проверка — в `contract.ts`. Модель не получает React-код.

После клика ваш `onAnswer` получает:

```json
{"type":"clarification_answer","questionId":"metric-1","optionId":"orders","label":"Заказы"}
```

Ваш существующий запрос отправляет ответ в тот же диалог; следующий ответ проходит через новый `beginResponse`. Невалидный JSON отклоняется UI, а не исправляется скрыто; повтор генерации или constrained decoding при необходимости настраиваются в вашей интеграции.

## Примеры выбора двух компонентов

Для уточнения агент выдаёт:

```text
<ui>{"type":"clarification","props":{"questionId":"metric-1","question":"Что показать?","options":[{"id":"revenue","label":"Выручка"},{"id":"orders","label":"Заказы"}]}}</ui>
```

Для известного числового результата:

```text
<ui>{"type":"metric","props":{"title":"Выручка","value":1250000,"unit":"₽"}}</ui>
```

Это один декодер и один хук для обоих компонентов. Текущая карточка заменяется следующим блоком. `metric` не вызывает `onAnswer`. Инструкции выбора включены в `A2UI_INSTRUCTIONS`: clarification для недостающего выбора, metric для известного числа; если числа нет, агент не должен его выдумывать.

Старый тег `<clarification>` заменён на `<ui>`; старые названия API заменены на общие A2UI-имена. Полная карта обновления есть в README модуля.

## Регистрация других компонентов

Меняйте `src/a2ui/catalog.tsx`: схема → `createComponentImplementation` с вашим React/AntD-компонентом → добавление в `Catalog`. Контроллер преобразует разрешённый JSON в `createSurface`, `updateDataModel`, `updateComponents`, а `A2uiView` передаёт модель в `A2uiSurface`. Для нового типа карточки расширьте контракт и явное преобразование в контроллере. Чат и транспорт для этого менять не нужно, если события остаются совместимы с вашим callback.
