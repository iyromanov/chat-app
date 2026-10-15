import path from 'node:path';
import { fileURLToPath } from 'node:url';

const isolation = {
  meta: {
    type: 'problem',
    schema: [],
    messages: { boundary: 'Import violates contracts isolation.' },
  },
  create(context) {
    return {
      'ImportDeclaration, ExportNamedDeclaration, ExportAllDeclaration, ImportExpression'(
        node,
      ) {
        const source = node.source?.value;
        if (typeof source !== 'string') return;
        const filename = context.filename.replaceAll('\\', '/');
        if (
          filename.includes('/packages/contracts/src/') &&
          (source.startsWith('.')
            ? !path.posix
                .resolve(path.posix.dirname(filename), source)
                .includes('/packages/contracts/src/')
            : source !== 'zod')
        ) {
          context.report({ node, messageId: 'boundary' });
          return;
        }
      },
    };
  },
};

export default [
  {
    basePath: path.dirname(fileURLToPath(import.meta.url)),
    files: ['src/**/*.ts'],
    plugins: { contracts: { rules: { isolation } } },
    rules: { 'contracts/isolation': 'error' },
  },
];
