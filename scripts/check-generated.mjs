import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const paths = [
  'apps/api/openapi.json',
  'apps/web/src/shared/api/schema.d.ts',
  'apps/web/src/shared/api/operations.ts',
];
const previous = paths.map((path) => readFileSync(path));
try {
  execFileSync('pnpm', ['generate'], { stdio: 'inherit' });
  if (
    paths.some((path, index) => !readFileSync(path).equals(previous[index]))
  ) {
    throw new Error(
      'OpenAPI/client artifacts are outdated. Run pnpm generate.',
    );
  }
} finally {
  paths.forEach((path, index) => writeFileSync(path, previous[index]));
}
