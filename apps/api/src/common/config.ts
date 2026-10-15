import { z } from 'zod';
const configSchema = z.object({
  MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\//),
  JWT_SECRET: z.string().min(32),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
});
export type Config = z.infer<typeof configSchema>;
export const CONFIG = Symbol('CONFIG');
export function readConfig(env: NodeJS.ProcessEnv): Config {
  const result = configSchema.safeParse(env);
  if (!result.success)
    throw new Error(
      `Invalid configuration: ${result.error.issues.map((i) => i.path.join('.') + ': ' + i.message).join('; ')}`,
    );
  return result.data;
}
