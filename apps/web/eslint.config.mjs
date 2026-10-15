import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const layers = ['app', 'pages', 'widgets', 'features', 'entities', 'shared'];
const architecture = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      boundary: 'Import violates FSD direction or public interface.',
    },
  },
  create(context) {
    return {
      'ImportDeclaration, ExportNamedDeclaration, ExportAllDeclaration, ImportExpression'(
        node,
      ) {
        const source = node.source?.value;
        if (typeof source !== 'string') return;
        const filename = context.filename.replaceAll('\\', '/');
        const root = '/apps/web/src/';
        if (!filename.includes(root)) return;
        const from = filename.split(root)[1].split('/');
        const aliases = {
          '@pages': 'pages',
          '@features': 'features',
          '@entities': 'entities',
          '@widgets': 'widgets',
          '@shared': 'shared',
          '@app': 'app',
        };
        let target;
        if (source.startsWith('.'))
          target = path.posix.normalize(
            path.posix.join(
              path.posix.dirname(filename.split(root)[1]),
              source,
            ),
          );
        else {
          const alias = Object.keys(aliases).find(
            (a) => source === a || source.startsWith(a + '/'),
          );
          if (alias) target = source.replace(alias, aliases[alias]);
          else if (
            source.startsWith('$lib') ||
            source.includes('apps/api') ||
            (source.startsWith('@chat/') && source !== '@chat/contracts')
          ) {
            context.report({ node, messageId: 'boundary' });
            return;
          }
        }
        if (!target) return;
        const to = target.split('/');
        const fromLayer = layers.indexOf(from[0]);
        const toLayer = layers.indexOf(to[0]);
        const sameSlice =
          from[0] === to[0] &&
          (['app', 'shared'].includes(from[0]) || from[1] === to[1]);
        if (
          toLayer < 0 ||
          (!sameSlice && (toLayer <= fromLayer || to.length > 2))
        )
          context.report({ node, messageId: 'boundary' });
      },
    };
  },
};

const basePath = path.dirname(fileURLToPath(import.meta.url));

export default [
  { ignores: ['**/.svelte-kit/**', 'src/shared/api/schema.d.ts'] },
  ...svelte.configs['flat/recommended'],
  {
    files: ['**/*.svelte'],
    languageOptions: { parserOptions: { parser: ts.parser } },
  },
  {
    files: ['**/*.svelte.ts'],
    languageOptions: { parser: ts.parser },
  },
  {
    languageOptions: { globals: { SubmitEvent: 'readonly' } },
  },
  {
    files: ['src/**/*.{ts,svelte}'],
    plugins: { architecture: { rules: { boundaries: architecture } } },
    rules: { 'architecture/boundaries': 'error' },
  },
].map((config) => ({ ...config, basePath }));
