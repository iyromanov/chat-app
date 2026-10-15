import { z } from 'zod';

export const objectIdSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/, 'Enter a valid ID');
