import { Alert, Button, Card, Space, Typography } from 'antd';
import { z } from 'zod';
import { Catalog, CommonSchemas } from '@a2ui/web_core/v0_9';
import { createComponentImplementation } from '@a2ui/react/v0_9';
import { OptionSchema } from './contract.js';

export const CATALOG_ID = 'urn:kxnzee:a2ui:clarification:v1';
export const SURFACE_ID = 'clarification';

export const ClarificationApi = {
  name: 'ClarificationCard',
  schema: z.object({
    question: z.string(),
    options: z.array(OptionSchema),
    selected: CommonSchemas.DynamicString,
    disabled: CommonSchemas.DynamicBoolean,
    answered: CommonSchemas.DynamicBoolean,
    error: CommonSchemas.DynamicString,
    onSelect: CommonSchemas.Action,
  }).strict(),
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

export const clarificationCatalog = new Catalog(
  CATALOG_ID, 'v0.9', [ClarificationCard], [],
);
