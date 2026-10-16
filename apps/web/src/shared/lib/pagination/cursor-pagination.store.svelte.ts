export type CursorPageMode = 'first' | 'next';

export type CursorPaginationState = {
  readonly nextCursor: string | null;
  readonly loading: boolean;
  readonly error: string;
  readonly failedMode: CursorPageMode | null;
};

type CursorPageRequest = {
  readonly mode: CursorPageMode;
  readonly cursor: string | undefined;
};

export class CursorPaginationStore implements CursorPaginationState {
  private currentRequest: CursorPageRequest | null = null;
  private disposed = false;
  private cursor = $state<string | null>(null);
  private pending = $state(false);
  private failure = $state('');
  private failed = $state<CursorPageMode | null>(null);

  get nextCursor() {
    return this.cursor;
  }

  get loading() {
    return this.pending;
  }

  get error() {
    return this.failure;
  }

  get failedMode() {
    return this.failed;
  }

  beginLoad(mode: CursorPageMode) {
    if (this.disposed || (mode === 'next' && (this.pending || !this.cursor)))
      return null;
    const request: CursorPageRequest = {
      mode,
      cursor: mode === 'next' ? (this.cursor ?? undefined) : undefined,
    };
    this.currentRequest = request;
    this.pending = true;
    this.failure = '';
    this.failed = null;
    return request;
  }

  isCurrent(request: CursorPageRequest) {
    return !this.disposed && this.currentRequest === request;
  }

  receivePage(request: CursorPageRequest, nextCursor: string | null) {
    if (!this.isCurrent(request)) return;
    this.cursor = nextCursor;
    this.pending = false;
  }

  failLoad(request: CursorPageRequest, error: string) {
    if (!this.isCurrent(request)) return;
    this.pending = false;
    this.failure = error;
    this.failed = request.mode;
  }

  reset() {
    this.currentRequest = null;
    this.cursor = null;
    this.pending = false;
    this.failure = '';
    this.failed = null;
  }

  dispose() {
    this.disposed = true;
    this.reset();
  }
}
