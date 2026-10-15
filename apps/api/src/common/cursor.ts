import { createHmac, timingSafeEqual } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
const cursorSchema = z
  .object({
    scope: z.string(),
    key: z.string(),
    id: z.string().regex(/^[a-f0-9]{24}$/),
  })
  .strict();
type Cursor = z.infer<typeof cursorSchema>;
export function encodeCursor(value: Cursor, secret: string) {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}
export function decodeCursor(
  value: string | undefined,
  scope: string,
  secret: string,
): Cursor | undefined {
  if (value === undefined) return;
  try {
    const [payload, signature, extra] = value.split('.');
    if (!payload || !signature || extra !== undefined) throw new Error();
    const expected = createHmac('sha256', secret)
      .update(payload)
      .digest('base64url');
    if (
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    )
      throw new Error();
    const cursor = cursorSchema.parse(
      JSON.parse(Buffer.from(payload, 'base64url').toString()),
    );
    if (cursor.scope !== scope) throw new Error();
    return cursor;
  } catch {
    throw new BadRequestException({
      code: 'INVALID_CURSOR',
      message: 'The cursor is invalid for this request',
    });
  }
}
