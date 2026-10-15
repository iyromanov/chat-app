import { decodeCursor, encodeCursor } from './cursor';

const PAGE_SIZE = 50;

type Position = { key: string; id: string };
type Page<T> = { items: T[]; nextCursor: string | null };
type Pagination<T> = {
  cursor?: string;
  scope: string;
  secret: string;
  load: (input: { limit: number; after?: Position }) => Promise<T[]>;
  position: (item: T) => Position;
};

/** Loads a scoped cursor page, using one extra row to detect continuation. */
export async function paginate<T>(input: Pagination<T>): Promise<Page<T>> {
  const after = decodeCursor(input.cursor, input.scope, input.secret);
  const rows = await input.load({ limit: PAGE_SIZE + 1, after });
  const items = rows.slice(0, PAGE_SIZE);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      rows.length > PAGE_SIZE && last !== undefined
        ? encodeCursor(
            { ...input.position(last), scope: input.scope },
            input.secret,
          )
        : null,
  };
}
