import { mkdir, writeFile, readdir, copyFile, rm } from 'node:fs/promises';
import { getAgentConfiguration } from '../src/a2ui/agent.ts';
import { cards } from '../src/a2ui/cards.tsx';
import { getDemoMessages } from '../src/demo/messages.ts';
const config = { ...getAgentConfiguration(cards), examples: getDemoMessages() };
// В схемах протокола catalog.json — стандартная точка подключения каталога.
// Inline-каталог SDK не содержит $defs, поэтому создаём схему для этих ссылок.
const functions = Object.fromEntries((config.catalogSchema.functions ?? []).map(fn => [fn.name, {
  type: 'object',
  description: fn.description,
  properties: { call: { const: fn.name }, args: fn.parameters, returnType: { const: fn.returnType } },
  required: ['call', 'args'],
  unevaluatedProperties: false,
}]));
const catalog = {
  $schema: config.protocolSchema.$schema,
  $id: new URL('catalog.json', config.protocolSchema.$id).href,
  catalogId: config.catalogSchema.catalogId,
  components: config.catalogSchema.components,
  functions,
  $defs: {
    anyComponent: { oneOf: Object.keys(config.catalogSchema.components ?? {}).map(name => ({ $ref: `#/components/${name}` })) },
    anyFunction: Object.keys(functions).length ? { oneOf: Object.keys(functions).map(name => ({ $ref: `#/functions/${name}` })) } : false,
    theme: { type: 'object', properties: config.catalogSchema.theme ?? {}, additionalProperties: false },
  },
};
await rm('dist/agent', { recursive: true, force: true });
await mkdir('dist/agent', { recursive: true });
for (const [name, value] of Object.entries(config)) {
  await writeFile(`dist/agent/${name}.${typeof value === 'string' ? 'txt' : 'json'}`,
    typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}
await writeFile('dist/agent/catalog.json', JSON.stringify(catalog, null, 2));

// Кладём оригинальные файлы SDK рядом для офлайн-разрешения внешних $ref.
const directory = new URL('./schemas/', import.meta.resolve('@a2ui/web_core/v0_9'));
for (const name of await readdir(directory)) {
  if (name.endsWith('.json') && name !== 'sample.json') {
    await copyFile(new URL(name, directory), `dist/agent/${name}`);
  }
}
console.log('dist/agent: каталог SDK, catalog.json для $ref, схемы протокола, capabilities, инструкции и примеры');
