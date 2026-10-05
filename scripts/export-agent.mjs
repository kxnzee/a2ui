import { mkdir, writeFile, readdir, copyFile } from 'node:fs/promises';
import { getAgentConfiguration } from '../src/a2ui/agent.ts';
await mkdir('dist/agent', { recursive: true });
const config = getAgentConfiguration();
for (const [name, value] of Object.entries(config)) {
  await writeFile(`dist/agent/${name}.${typeof value === 'string' ? 'txt' : 'json'}`,
    typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}
console.log('dist/agent: каталог и схема протокола из SDK, capabilities, инструкции и примеры');

// Кладём оригинальные файлы SDK рядом для офлайн-разрешения внешних $ref.
const directory = new URL('./schemas/', import.meta.resolve('@a2ui/web_core/v0_9'));
for (const name of await readdir(directory)) {
  if (name.endsWith('.json') && name !== 'sample.json') {
    await copyFile(new URL(name, directory), `dist/agent/${name}`);
  }
}
