import { Button, Card, Statistic, Space } from 'antd';
import { z } from 'zod';
import { Catalog, CommonSchemas } from '@a2ui/web_core/v0_9';
import { createComponentImplementation } from '@a2ui/react/v0_9';

const OptionSchema = z.object({
  id: z.string().min(1).max(100), label: z.string().trim().min(1).max(160),
}).strict();

export const CATALOG_ID = 'urn:kxnzee:a2ui:cards:v2';

const writablePath = (value: unknown) => typeof value === 'object' && value !== null &&
  'path' in value && typeof value.path === 'string' && value.path.startsWith('/') && value.path !== '/';

export const ClarificationApi = {
  name: 'ClarificationCard',
  schema: z.object({
    question: CommonSchemas.DynamicString,
    options: z.array(OptionSchema).min(2).max(6).refine(options => new Set(options.map(o => o.id)).size === options.length, 'ID вариантов должны быть уникальны'),
    selected: CommonSchemas.DynamicString.refine(writablePath, 'selected требует абсолютный data binding'),
    disabled: CommonSchemas.DynamicBoolean.optional(),
    onSelect: CommonSchemas.Action,
  }).strict().describe('Уточнение с 2–6 вариантами. selected привяжи к data model. При выборе вызывается onSelect; context действия может ссылаться на selected.'),
};

const ClarificationCard = createComponentImplementation(ClarificationApi, ({ props }) => (
  <Card title={<span style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{props.question}</span>}>
    <Space orientation="vertical" style={{ width: '100%' }}>
      <Space wrap>
        {props.options.map(option => (
          <Button
            key={option.id}
            type={props.selected === option.id ? 'primary' : 'default'}
            disabled={props.disabled}
            style={{ height: 'auto', whiteSpace: 'normal', overflowWrap: 'anywhere', maxWidth: '100%' }}
            onClick={() => {
              props.setSelected(option.id);
              props.onSelect();
            }}
          >
            {option.label}
          </Button>
        ))}
      </Space>
    </Space>
  </Card>
));

export const MetricApi = {
  name: 'MetricCard',
  schema: z.object({
    title: z.string().trim().min(1).max(160), value: z.number().finite(), unit: z.string().trim().min(1).max(24).optional(),
  }).strict().describe('Одно известное числовое значение с названием и необязательной единицей. Не выдумывай значение; если данных нет, запроси их. Не имеет события выбора.'),
};

const MetricCard = createComponentImplementation(MetricApi, ({ props }) => (
  <Card>
    <Statistic title={props.title} value={props.value} suffix={props.unit}
      groupSeparator=" " decimalSeparator="," />
  </Card>
));

export const CATALOG_INSTRUCTIONS = `Выбирай ClarificationCard, если для продолжения нужен выбор пользователя; MetricCard — для одного известного числового результата. Если данных нет, не выдумывай число.
ID вариантов должны быть уникальны. selected привяжи к абсолютному пути data model и инициализируй пустой строкой.
onSelect — event с name="clarification_answer" и context: questionId (ID вопроса), optionId (binding к selected).
Если чат должен блокировать варианты во время запроса, используй необязательный disabled, например binding к /disabled. Статус отправки и ошибки обрабатывает приложение, не A2UI.
Действие клиента приходит как стандартное сообщение {version:"v0.9",action:{name,surfaceId,sourceComponentId,timestamp,context}}. После выбора продолжи задачу.
Корневой компонент имеет id="root". Можно обновлять существующие поверхности; удаляй завершённую карточку через deleteSurface, если она больше не нужна.`;

// Одна регистрация служит renderer, валидации и экспорту JSON Schema агенту.
export const a2uiCatalog = new Catalog(
  CATALOG_ID, 'v0.9', [ClarificationCard, MetricCard], [], undefined, CATALOG_INSTRUCTIONS,
);
