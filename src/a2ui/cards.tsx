import { useState } from 'react';
import { Button, Card, Statistic, Space } from 'antd';
import { z } from 'zod-a2ui';
import { Catalog, CommonSchemas } from '@a2ui/web_core/v0_9';
import { createComponentImplementation } from '@a2ui/react/v0_9';
import type { A2uiCatalogKit } from './processor.js';

const OptionSchema = z.object({
  id: z.string().min(1).max(100),
  label: z.string().trim().min(1).max(160),
}).strict();

export const CATALOG_ID = 'urn:kxnzee:a2ui:cards:v2';

function isWritablePath(value: unknown) {
  return typeof value === 'object' && value !== null &&
    'path' in value && typeof value.path === 'string' &&
    value.path.startsWith('/') && value.path !== '/';
}

const OptionsSchema = z.array(OptionSchema).min(2).max(6).refine(
  options => new Set(options.map(option => option.id)).size === options.length,
  'ID вариантов должны быть уникальны',
);

// REF-description нужен binder SDK 0.11 для распознавания DynamicString.
const SelectedSchema = CommonSchemas.DynamicString
  .refine(isWritablePath, 'selected требует абсолютный data binding')
  .describe(CommonSchemas.DynamicString.description!);

export const ClarificationApi = {
  name: 'ClarificationCard',
  schema: z.object({
    question: CommonSchemas.DynamicString,
    options: OptionsSchema,
    selected: SelectedSchema,
    disabled: CommonSchemas.DynamicBoolean.optional(),
    onSelect: CommonSchemas.Action,
  }).strict().describe('Уточнение с 2–6 вариантами. selected привяжи к data model. При выборе вызывается onSelect; context действия может ссылаться на selected.'),
};

const ClarificationCard = createComponentImplementation(ClarificationApi, ({ props }) => {
  // Блокировка от повторной отправки хранится локально, а не выводится из selected:
  // модель может сама проставить selected по умолчанию, и тогда карточка была бы
  // заблокирована до первого клика. Блокировка снимается, когда приложение
  // сбрасывает selected (updateDataModel) — например, чтобы повторить после ошибки.
  const [sent, setSent] = useState<string>();
  const locked = sent !== undefined && props.selected === sent;
  return (
  <Card title={<span style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{props.question}</span>}>
    <Space direction="vertical" style={{ width: '100%' }}>
      <Space wrap>
        {props.options.map(option => (
          <Button
            key={option.id}
            type={props.selected === option.id ? 'primary' : 'default'}
            disabled={props.disabled || locked}
            style={{ height: 'auto', whiteSpace: 'normal', overflowWrap: 'anywhere', maxWidth: '100%' }}
            onClick={() => {
              setSent(option.id);
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
  );
});

export const MetricApi = {
  name: 'MetricCard',
  schema: z.object({
    title: z.string().trim().min(1).max(160),
    value: z.number().finite().safe(), // вне безопасного диапазона JSON-число теряет точность
    unit: z.string().trim().min(1).max(24).optional(),
  }).strict().describe('Одно известное числовое значение с названием и необязательной единицей. Не выдумывай значение; если данных нет, запроси их. Не имеет события выбора.'),
};

// Локаль берётся из lang страницы (по умолчанию ru-RU). Значащие цифры, а не знаки
// после запятой: малые значения вроде 1e-21 не должны превращаться в 0.
const formatNumber = (value: number) => new Intl.NumberFormat(
  document.documentElement.lang || 'ru-RU', { maximumSignificantDigits: 21 },
).format(value);

const MetricCard = createComponentImplementation(MetricApi, ({ props }) => (
  <Card>
    <Statistic title={props.title} value={props.value} suffix={props.unit}
      formatter={value => formatNumber(Number(value))} />
  </Card>
));

const CATALOG_INSTRUCTIONS = `Выбирай ClarificationCard, если для продолжения нужен выбор пользователя; MetricCard — для одного известного числового результата. Если данных нет, не выдумывай число.
ID вариантов должны быть уникальны. selected привяжи к абсолютному пути data model и инициализируй пустой строкой.
onSelect — event с name="clarification_answer" и context: optionId (binding к selected). Вопрос определяют surfaceId и sourceComponentId из действия.
После клика карточка блокируется сама. Чтобы разрешить повторный выбор, приложение меняет selected через updateDataModel (например, на пустую строку). Необязательный disabled (например, binding к /disabled) блокирует варианты принудительно. Статус отправки и ошибки обрабатывает приложение, не A2UI.
Действие клиента приходит как стандартное сообщение {version:"v0.9",action:{name,surfaceId,sourceComponentId,timestamp,context}}. После выбора продолжи задачу.
Корневой компонент имеет id="root". Можно обновлять существующие поверхности; удаляй завершённую карточку через deleteSurface, если она больше не нужна.`;

// Одна регистрация служит renderer, валидации и экспорту JSON Schema агенту.
export const cardsCatalog = new Catalog(
  CATALOG_ID, [ClarificationCard, MetricCard],
);

// Передаётся в useA2ui({ catalogs: [cards.catalog] }) и getAgentConfiguration(cards).
export const cards: A2uiCatalogKit = { catalog: cardsCatalog, instructions: CATALOG_INSTRUCTIONS };
