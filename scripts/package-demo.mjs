import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
await mkdir('releases', { recursive: true });
const path = 'releases/a2ui-clarification-demo.tar.gz';
execFileSync('tar', ['-czf', path, '-C', 'dist/demo', '.']);
const sha = createHash('sha256').update(await readFile(path)).digest('hex');
await writeFile(`${path}.sha256`, `${sha}  a2ui-clarification-demo.tar.gz\n`);
console.log(path);
