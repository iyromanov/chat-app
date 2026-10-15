import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const paths = ['apps/api/openapi.json', 'apps/web/src/shared/api/generated.ts'];
const before = await Promise.all(paths.map((path) => readFile(path)));
execFileSync('pnpm', ['generate'], { stdio: 'inherit' });
const after = await Promise.all(paths.map((path) => readFile(path)));
if (before.some((content, index) => !content.equals(after[index]))) {
  throw new Error(
    'Generated API artifacts were stale. Commit the output of pnpm generate',
  );
}
