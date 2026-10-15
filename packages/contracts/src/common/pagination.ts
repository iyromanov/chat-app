import { z } from 'zod';

export const paginationQuerySchema = z.object({
  cursor: z.string().min(1).max(2048).optional(),
});
