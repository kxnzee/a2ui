import { Alert, Button, Card, Statistic, Space, Typography } from 'antd';
import { z } from 'zod';
import { Catalog, CommonSchemas } from '@a2ui/web_core/v0_9';
import { createComponentImplementation } from '@a2ui/react/v0_9';
import { OptionSchema } from './contract.js';

export const CATALOG_ID = 'urn:kxnzee:a2ui:cards:v1';
export const SURFACE_ID = 'agent-card';

const writablePath = (value: unknown) => typeof value === 'object' && value !== null &&
  'path' in value && typeof value.path === 'string' && value.path.startsWith('/') && value.path !== '/';

export const ClarificationApi = {
  name: 'ClarificationCard',
  schema: z.object({
    questionId: z.string().min(1).max(100),
    question: z.string().trim().min(1).max(600),
    options: z.array(OptionSchema).min(2).max(6).refine(options => new Set(options.map(o => o.id)).size === options.length, 'ID вариантов должны быть уникальны'),
    selected: CommonSchemas.DynamicString.refine(writablePath, 'selected требует абсолютный data binding'),
    disabled: CommonSchemas.DynamicBoolean.refine(writablePath, 'disabled требует абсолютный data binding'),
    answered: CommonSchemas.DynamicBoolean.refine(writablePath, 'answered требует абсолютный data binding'),
    error: CommonSchemas.DynamicString.refine(writablePath, 'error требует абсолютный data binding'),
    onSelect: CommonSchemas.Action,
  }).strict().describe('Уточнение с 2–6 вариантами. Используй, когда нужен выбор пользователя. selected, disabled, answered, error должны быть data bindings; onSelect — событие clarification_answer с questionId и optionId.'),
};

const ClarificationCard = createComponentImplementation(ClarificationApi, ({ props }) => (
  <Card title={props.question}>
    <Space orientation="vertical" style={{ width: '100%' }}>
      <Space wrap>
        {props.options.map(option => (
          <Button
            key={option.id}
            type={props.selected === option.id ? 'primary' : 'default'}
            disabled={props.disabled}
            onClick={() => {
              props.setSelected(option.id);
              props.onSelect();
            }}
          >
            {option.label}
          </Button>
        ))}
      </Space>
      {props.answered && (
        <Typography.Text type="secondary">
          Вы выбрали: {props.options.find(option => option.id === props.selected)?.label}
        </Typography.Text>
      )}
      {props.error && <Alert type="error" title={props.error} />}
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
Каждому новому вопросу нужен новый questionId. ID вариантов должны быть уникальны.
У ClarificationCard selected, disabled, answered, error привяжи к отдельным абсолютным путям data model. Сначала инициализируй их: selected="", disabled=false, answered=false, error="".
onSelect — event с name="clarification_answer" и context: questionId (тот же ID), optionId (binding к selected).
Действие клиента приходит как стандартное сообщение {version:"v0.9",action:{name,surfaceId,sourceComponentId,timestamp,context}}. После выбора продолжи задачу.
Корневой компонент имеет id="root". Можно обновлять существующие поверхности; удаляй завершённую карточку через deleteSurface, если она больше не нужна.`;

// Одна регистрация служит renderer, валидации и экспорту JSON Schema агенту.
export const a2uiCatalog = new Catalog(
  CATALOG_ID, 'v0.9', [ClarificationCard, MetricCard], [], undefined, CATALOG_INSTRUCTIONS,
);
