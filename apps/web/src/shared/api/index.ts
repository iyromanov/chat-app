import createClient from 'openapi-fetch';
import type { paths } from './schema';
import { createOperations } from './operations';
import { errorSchema } from '@chat/contracts';
export class ApiError extends Error {
  constructor(
    public readonly body: {
      code: string;
      message: string;
      fields?: Record<string, string[]>;
    },
  ) {
    super(body.message);
  }
}
export function createApi(options: {
  baseUrl?: string;
  fetch?: typeof fetch;
  onUnauthorized: () => void;
}) {
  const client = createClient<paths>({
    baseUrl: options.baseUrl ?? '',
    fetch: options.fetch,
    credentials: 'include',
  });
  client.use({
    async onResponse({ response }) {
      if (response.ok) return response;
      if (response.status === 401) options.onUnauthorized();
      const parsed = errorSchema.safeParse(
        await response
          .clone()
          .json()
          .catch(() => null),
      );
      throw new ApiError(
        parsed.success
          ? parsed.data
          : {
              code: 'NETWORK_ERROR',
              message: 'Service unavailable. Please try again later',
            },
      );
    },
  });
  return createOperations(client);
}
export type ApiClient = ReturnType<typeof createApi>;
