import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
await mkdir('releases', { recursive: true });
const path = 'releases/a2ui-source.tar.gz';
execFileSync('tar', ['-czf', path, '-C', 'src', 'a2ui']);
const sha = createHash('sha256').update(await readFile(path)).digest('hex');
await writeFile(`${path}.sha256`, `${sha}  a2ui-source.tar.gz\n`);
console.log(path);
