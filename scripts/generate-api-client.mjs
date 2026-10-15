import { resolve } from 'node:path';
import { generateApi } from 'swagger-typescript-api';

await generateApi({
  input: resolve('apps/api/openapi.json'),
  output: resolve('apps/web/src/shared/api'),
  fileName: 'generated.ts',
  httpClientType: 'fetch',
  generateResponses: true,
  moduleNameFirstTag: true,
  hooks: {
    onFormatRouteName: (route, name) =>
      route.operationId?.split('Controller_')[1] ?? name,
  },
});
