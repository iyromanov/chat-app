import type {
  CursorPageMode,
  CursorPaginationStore,
} from './cursor-pagination.store.svelte';

export async function loadCursorPage<
  Page extends { nextCursor: string | null },
>({
  pagination,
  mode,
  fetchPage,
  applyPage,
  errorMessage,
  onSettled,
}: {
  pagination: CursorPaginationStore;
  mode: CursorPageMode;
  fetchPage: (cursor: string | undefined) => Promise<Page | undefined>;
  applyPage: (page: Page, mode: CursorPageMode) => void;
  errorMessage: string;
  onSettled?: () => void;
}): Promise<void> {
  const request = pagination.beginLoad(mode);
  if (!request) return;
  try {
    const page = await fetchPage(request.cursor);
    if (!pagination.isCurrent(request)) return;
    if (!page) throw new Error('Missing page');
    applyPage(page, request.mode);
    pagination.receivePage(request, page.nextCursor);
  } catch {
    if (pagination.isCurrent(request))
      pagination.failLoad(request, errorMessage);
  } finally {
    if (pagination.isCurrent(request)) onSettled?.();
  }
}
