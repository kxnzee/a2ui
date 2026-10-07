import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('offline agent export removes stale files and resolves all schema references locally', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'a2ui-agent-export-'));
  try {
    const output = join(directory, 'dist/agent');
    await mkdir(output, { recursive: true });
    await writeFile(join(output, 'obsolete.json'), '{}');
    execFileSync(process.execPath, [
      '--import', import.meta.resolve('tsx'),
      fileURLToPath(new URL('../scripts/export-agent.mjs', import.meta.url)),
    ], { cwd: directory, stdio: 'pipe' });
    const names = await readdir(output);
    assert.equal(names.includes('obsolete.json'), false);
    assert.ok(names.includes('catalog.json'));
    const base = 'https://a2ui.org/specification/v0_9/';
    const documents = new Map();
    for (const name of names.filter(name => name.endsWith('.json'))) {
      const document = JSON.parse(await readFile(join(output, name), 'utf8'));
      documents.set(new URL(name, base).href, document);
      if (document.$id) documents.set(document.$id, document);
    }
    const catalog = documents.get(new URL('catalog.json', base).href);
    const inline = documents.get(new URL('catalogSchema.json', base).href);
    assert.deepEqual(catalog.components, inline.components);
    assert.equal(catalog.catalogId, inline.catalogId);
    for (const [name, component] of Object.entries(inline.components)) assert.ok(component.description, `${name}: нет description`);
    assert.deepEqual(catalog.$defs.anyComponent.oneOf, [
      { $ref: '#/components/ClarificationCard' }, { $ref: '#/components/MetricCard' },
    ]);
    assert.equal(catalog.$defs.anyFunction, false);
    let refs = 0;
    function verify(node, scope) {
      if (!node || typeof node !== 'object') return;
      if (node.$id) scope = new URL(node.$id, scope).href;
      if (typeof node.$ref === 'string') {
        const url = new URL(node.$ref, scope);
        // Draft 2020-12 meta-schema is built into JSON Schema validators.
        if (url.href !== 'https://json-schema.org/draft/2020-12/schema') {
          refs++;
          const fragment = decodeURIComponent(url.hash.slice(1)); url.hash = '';
          let target = documents.get(url.href);
          assert.notEqual(target, undefined, `Missing schema: ${node.$ref} from ${scope}`);
          for (const part of fragment.split('/').slice(1)) {
            target = target?.[part.replaceAll('~1', '/').replaceAll('~0', '~')];
          }
          assert.notEqual(target, undefined, `Missing definition: ${node.$ref} from ${scope}`);
        }
      }
      for (const value of Object.values(node)) verify(value, scope);
    }
    for (const [uri, document] of documents) verify(document, uri);
    assert.ok(refs > 30);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('agent export works for a custom kit passed by path', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'a2ui-agent-export-kit-'));
  try {
    execFileSync(process.execPath, [
      '--import', import.meta.resolve('tsx'),
      fileURLToPath(new URL('../scripts/export-agent.mjs', import.meta.url)),
      '--kit', fileURLToPath(new URL('./fixtures-kit.tsx', import.meta.url)),
      '--examples', fileURLToPath(new URL('./fixtures-kit.tsx', import.meta.url)),
    ], { cwd: directory, stdio: 'pipe' });
    const output = join(directory, 'dist/agent');
    const catalog = JSON.parse(await readFile(join(output, 'catalog.json'), 'utf8'));
    assert.equal(catalog.catalogId, 'urn:acme:badges:v1');
    assert.deepEqual(Object.keys(catalog.components), ['Badge']);
    assert.match(await readFile(join(output, 'instructions.txt'), 'utf8'), /Используй Badge\./);
    assert.deepEqual(JSON.parse(await readFile(join(output, 'framing.json'), 'utf8')), { open: '<a2ui>', close: '</a2ui>' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
