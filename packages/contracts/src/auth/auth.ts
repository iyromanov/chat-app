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
export type Registration = z.infer<typeof registrationSchema>;

export const authReadySchema = z.object({ expiresAt: z.iso.datetime() });

export const AUTH_EXPIRES_HEADER = 'X-Auth-Expires-At';
export const authDeadlineSchema = z.iso.datetime();
