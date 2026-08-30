import { forgefx } from './forgefx';
import type { BlockLibraryCandidate } from './types';

export type BlockLibraryStatus = 'idle' | 'loading' | 'ready' | 'error';

class BlockLibraryStore {
  candidates = $state<BlockLibraryCandidate[]>([]);
  status = $state<BlockLibraryStatus>('idle');
  path = $state('');
  #scheduledPath = '';
  #request: Promise<void> | null = null;

  load = async (path: string): Promise<void> => {
    const nextPath = path.trim();
    if (!nextPath) {
      this.path = '';
      this.candidates = [];
      this.status = 'idle';
      return;
    }
    if (this.path === nextPath && (this.status === 'ready' || this.status === 'loading')) return this.#request ?? Promise.resolve();
    this.path = nextPath;
    this.status = 'loading';
    const request = forgefx.blockLibrarySources(nextPath)
      .then(({ candidates }) => {
        if (this.path === nextPath) {
          this.candidates = candidates;
          this.status = 'ready';
        }
      })
      .catch(() => {
        if (this.path === nextPath) {
          this.candidates = [];
          this.status = 'error';
        }
      })
      .finally(() => { if (this.#request === request) this.#request = null; });
    this.#request = request;
    return request;
  };

  preloadWhenIdle(path: string): void {
    const nextPath = path.trim();
    if (!nextPath || nextPath === this.path || nextPath === this.#scheduledPath) return;
    this.#scheduledPath = nextPath;
    const load = () => {
      this.#scheduledPath = '';
      void this.load(nextPath);
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(load, { timeout: 3000 });
    else setTimeout(load, 500);
  }
}

export const blockLibrary = new BlockLibraryStore();
