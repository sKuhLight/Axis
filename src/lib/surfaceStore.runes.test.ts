// The surface store folds legacy localStorage keys it OWNS into the shared config/surface document (which
// is what reaches the cloud mirror and the remote). The Block Editor's `axs.be1*` keys must be part of
// that set, or a remote never sees boards saved before the store took over.
//
// A `.runes.test.ts` because the store is a rune module (`$state`), compiled in client mode here.
import { describe, expect, it, vi } from 'vitest';

const getDoc = vi.fn(async () => null);
const putDoc = vi.fn(async () => ({}));
vi.mock('./forgefx', () => ({ forgefx: { getDoc, putDoc }, isRemote: () => false }));
vi.mock('./cloudBrowser', () => ({ isRemoteBuild: () => false }));
vi.mock('./syncBus', () => ({ notifyMutation: () => {} }));

const data = new Map<string, string>([
  ['axs.be1.amp.Default.desktop', '{"v":2}'],
  ['axs.be1meta.amp', '{"active":"Default","names":[]}'],
  ['axs.be1seed.amp', '{"v":2}'],
  ['axs.surface3.amp.Default', '{}'],
  ['axs.workbench.doc', '{}'],
  ['axs.be2.amp', '{}'],
  ['axs.be10.amp', '{}'],
  ['axs.be1other.amp', '{}']
]);
vi.stubGlobal('localStorage', {
  get length() {
    return data.size;
  },
  key: (i: number) => [...data.keys()][i] ?? null,
  getItem: (k: string) => data.get(k) ?? null,
  setItem: (k: string, v: string) => void data.set(k, v),
  removeItem: (k: string) => void data.delete(k)
});

const { surfInit, surfGet } = await import('./surfaceStore.svelte');

describe('surfaceStore owned keys', () => {
  it('folds the Block Editor keys into the surface document, and nothing foreign', async () => {
    await surfInit();
    expect(surfGet('axs.be1.amp.Default.desktop')).toBe('{"v":2}');
    expect(surfGet('axs.be1meta.amp')).toBe('{"active":"Default","names":[]}');
    expect(surfGet('axs.be1seed.amp')).toBe('{"v":2}');
    expect(surfGet('axs.surface3.amp.Default')).toBe('{}');
    expect(surfGet('axs.workbench.doc')).toBeNull();
    expect(surfGet('axs.be2.amp')).toBeNull();
    expect(surfGet('axs.be10.amp')).toBeNull();
    expect(surfGet('axs.be1other.amp')).toBeNull();
    expect(putDoc).toHaveBeenCalled();
  });
});
