import { z } from 'zod';

export const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
  fields: z.record(z.string(), z.array(z.string())).optional(),
});
export type ApiErrorBody = z.infer<typeof errorSchema>;
