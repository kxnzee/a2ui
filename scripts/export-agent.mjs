import { mkdir, writeFile, readdir, copyFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getAgentConfiguration, buildCatalogSchema } from '../src/a2ui/agent.ts';

// Экспорт конфигурации агента в dist/agent.
//   node --import tsx scripts/export-agent.mjs [--kit <модуль>] [--examples <модуль>]
// --kit: модуль, экспортирующий `kit` (или default, или `cards`) вида {catalog, instructions};
// --examples: модуль с `examples` (или default) — объект либо функция с примерами сообщений.
// Без аргументов экспортируются встроенные карточки и демо-примеры.
const option = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const load = (value, fallback) => import(value ? pathToFileURL(resolve(value)).href : new URL(fallback, import.meta.url).href);
const kitModule = await load(option('--kit'), '../src/a2ui/cards.tsx');
const kit = kitModule.kit ?? kitModule.default ?? kitModule.cards;
if (!kit?.catalog) throw new Error('--kit: модуль должен экспортировать {catalog, instructions} как kit, default или cards');
const examplesModule = await load(option('--examples'), '../src/demo/messages.ts');
const rawExamples = examplesModule.examples ?? examplesModule.default ?? examplesModule.getDemoMessages;
const examples = typeof rawExamples === 'function' ? rawExamples() : rawExamples ?? {};
const config = { ...getAgentConfiguration(kit), examples };
const catalog = buildCatalogSchema(config);
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
