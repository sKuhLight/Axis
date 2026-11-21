// Debounce behind the editor's event-driven device re-reads (scene / block-state / structural change).
//
// Every device event that makes the UI re-read the device goes through ONE scheduler, so a burst coalesces into a
// single read — and, while a definitions walk/import or a diagnostic run owns the transport (`busy()`), the read
// waits instead and runs once afterwards. Several kinds can be pending at once; the STRONGEST wins, so a deferred
// full reload (`changed`) is never downgraded by a later lighter refresh (`scene`, `blockState`) that arrived
// while it waited. Framework-free so it is unit-tested with fake timers (`reloadScheduler.test.ts`).

/** Kinds of event-driven re-read, weakest first: a block-state refresh, a scene refresh, a full structural reload. */
export type ReloadKind = 'blockState' | 'scene' | 'changed';

const RANK: Record<ReloadKind, number> = { blockState: 0, scene: 1, changed: 2 };

/** The stronger of two kinds (`changed` > `scene` > `blockState`); on a tie the later one. */
export const strongerReload = (earlier: ReloadKind, later: ReloadKind): ReloadKind => (RANK[later] >= RANK[earlier] ? later : earlier);

export class ReloadScheduler {
  #timer: ReturnType<typeof setTimeout> | null = null;
  #pending: { kind: ReloadKind; run: () => unknown } | null = null;

  /** `busy`: a job that owns the device transport is active — wait (checking again every `rearmMs`). */
  constructor(
    private readonly busy: () => boolean,
    private readonly rearmMs = 1000
  ) {}

  /** The kind that will run when the timer fires (null = nothing pending). */
  get pendingKind(): ReloadKind | null {
    return this.#pending?.kind ?? null;
  }

  /**
   * Ask for a re-read `settleMs` from now. A burst restarts the settle window; what finally runs is the strongest
   * kind asked for in that time (the latest of equals), once, and never while `busy()`.
   */
  schedule(kind: ReloadKind, settleMs: number, run: () => unknown): void {
    if (this.#timer) clearTimeout(this.#timer);
    if (!this.#pending || strongerReload(this.#pending.kind, kind) === kind) this.#pending = { kind, run };
    const fire = (): void => {
      if (this.busy()) {
        this.#timer = setTimeout(fire, this.rearmMs);
        return;
      }
      this.#timer = null;
      const job = this.#pending;
      this.#pending = null;
      if (job) void job.run();
    };
    this.#timer = setTimeout(fire, settleMs);
  }

  /** Drop whatever is pending (teardown / device change). */
  cancel(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    this.#pending = null;
  }
}
