import { describe, expect, it } from 'vitest';
import { DECODE_VERSION, decodeCacheStale } from './libraryDecodeCache';

describe('persisted decode-cache versioning', () => {
  it('treats the current decoder marker as fresh', () => {
    expect(decodeCacheStale(DECODE_VERSION)).toBe(false);
  });

  it('treats an older decoder marker as stale', () => {
    expect(decodeCacheStale(DECODE_VERSION - 1)).toBe(true);
  });

  it('treats an absent marker (a pre-versioning install) as stale', () => {
    for (const missing of [undefined, null, '', 'x']) expect(decodeCacheStale(missing)).toBe(true);
  });
});
