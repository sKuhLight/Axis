import { describe, expect, it } from 'vitest';
import {
  buildPresetBrowserOramaIndex,
  rankPresetBrowserOramaMatches
} from '../presetBrowser/presetBrowserWorkbenchOrama';

// Haystack-shaped docs, mirroring the prepared `entryHaystack` strings the workbench index builds.
const docs = [
  { id: 'dev:1', text: 'studio clean deluxe verb amp' },
  { id: 'dev:2', text: 'hendrix tones lead amp 5153' },
  { id: 'dev:3', text: 'ambient wash reverb plex delay' }
];

describe('Preset Browser Orama search', () => {
  it('returns an empty rank map for a blank term', async () => {
    const db = await buildPresetBrowserOramaIndex(docs);
    expect(await rankPresetBrowserOramaMatches(db, '   ')).toEqual(new Map());
  });

  it('ranks an exact term to its entry', async () => {
    const db = await buildPresetBrowserOramaIndex(docs);
    const rank = await rankPresetBrowserOramaMatches(db, 'ambient');
    expect([...rank.keys()]).toEqual(['dev:3']);
    expect(rank.get('dev:3')).toBe(0);
  });

  it('is typo-tolerant: a one-edit miss still resolves', async () => {
    const db = await buildPresetBrowserOramaIndex(docs);
    const rank = await rankPresetBrowserOramaMatches(db, 'hendrx');
    expect(rank.has('dev:2')).toBe(true);
  });

  it('returns no hits for an unrelated term', async () => {
    const db = await buildPresetBrowserOramaIndex(docs);
    expect((await rankPresetBrowserOramaMatches(db, 'banjo')).size).toBe(0);
  });
});
