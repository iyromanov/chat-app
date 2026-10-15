import { z } from 'zod';

export const registrationSchema = z.object({
  email: z.email('Enter a valid email').trim().max(254),
  username: z
    .string()
    .regex(
      /^[A-Za-z0-9_]{3,30}$/,
      'Username must contain 3–30 Latin letters, digits or underscores',
    ),
  password: z
    .string()
    .min(8, 'Use at least 8 characters')
    .max(128, 'Use at most 128 characters'),
});
export const loginSchema = registrationSchema.pick({
  email: true,
  password: true,
});
export type Login = z.infer<typeof loginSchema>;

export const currentUserSchema = z.object({
  id: z.string(),
  email: z.email(),
  username: z.string(),
});
export const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
  fields: z.record(z.string(), z.array(z.string())).optional(),
});
export type Registration = z.infer<typeof registrationSchema>;
export type CurrentUser = z.infer<typeof currentUserSchema>;
export type ApiErrorBody = z.infer<typeof errorSchema>;

export const authReadySchema = z.object({ expiresAt: z.iso.datetime() });
export interface ServerEvents {
  'auth:ready': (data: z.infer<typeof authReadySchema>) => void;
  'auth:ended': () => void;
}
