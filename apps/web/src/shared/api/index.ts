import { Api } from './generated';
import { AUTH_EXPIRES_HEADER, authDeadlineSchema } from '@chat/contracts/auth';
import { errorSchema } from '@chat/contracts/common';
export class ApiError extends Error {
  constructor(
    readonly body: {
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
  const client = new Api({
    baseUrl: options.baseUrl ?? '',
    baseApiParams: { credentials: 'include' },
    customFetch: async (...args) => {
      const response = await (options.fetch ?? fetch)(...args);
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
  return client;
}

export type ApiClient = ReturnType<typeof createApi>;

export function readAuthDeadline(response: Response): number {
  const deadline = authDeadlineSchema.parse(
    response.headers.get(AUTH_EXPIRES_HEADER),
  );
  return Date.parse(deadline);
}
