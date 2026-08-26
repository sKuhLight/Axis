// Reactivity contract for library.applyColorLabelGroups (replicated-purring-bachman) — mirrors
// library.runes.test.ts's module-mock setup so the singleton constructs cleanly in node.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PresetSummary, ColorLabelGroup } from './types';
import type { LibEntry } from './library.svelte';

vi.mock('./forgefx', () => ({
  forgefx: {
    presetParams: vi.fn(),
    decodePresetFile: vi.fn(),
    putDoc: vi.fn(async () => ({})),
    listDocs: vi.fn(async () => ({ docs: [] })),
    deleteDoc: vi.fn(async () => ({}))
  },
  isRemote: () => false
}));
vi.mock('./cloudBrowser', () => ({ isRemoteBuild: () => true }));
vi.mock('./idb', () => ({ idb: { available: () => false, get: async () => undefined, set: async () => undefined } }));
vi.mock('./cabIrsCache', () => ({ refreshCabIrsCache: async () => {} }));
vi.mock('./syncBus', () => ({ notifyMutation: () => {} }));

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear()
  } as Storage;
}
vi.stubGlobal('localStorage', memoryStorage());

const { library } = await import('./library.svelte');

const summary = (number: number, name: string): PresetSummary => ({
  number,
  name,
  model: 'AxisFx3',
  crcValid: true,
  crc: number,
  scenes: ['Scene 1'],
  blocks: [],
  models: {},
  amps: []
});
let nextNumber = 1;
const deviceEntry = (name: string): LibEntry => {
  const number = nextNumber++;
  return { id: `dev:${number}`, source: 'device', summary: summary(number, name), fav: false };
};
const fileEntry = (name: string): LibEntry => {
  const number = nextNumber++;
  return { id: `file:${name}-${number}`, source: 'file', summary: summary(number, name), fav: false };
};

const RED_GROUP = (names: string[]): ColorLabelGroup => ({ hex: '#febcbc', names });

beforeEach(() => {
  library.entries = [];
  library.tags = {};
  library.tagColors = {};
});

describe('applyColorLabelGroups', () => {
  it('tags matching device entries and claims a deliberate swatch (no separate setTagColor race)', () => {
    const lead = deviceEntry('Lead Tone');
    const clean = deviceEntry('Clean');
    library.entries = [lead, clean];

    const result = library.applyColorLabelGroups([RED_GROUP(['Lead Tone'])]);

    expect(result.tagged).toBe(1);
    expect(result.unmatched).toEqual([]);
    expect(library.tags[lead.id]).toEqual(['Red']);
    expect(library.tags[clean.id]).toBeUndefined();
    expect(library.tagColors['Red']).toBe(0); // fixed FM3 Red → swatch 0, not claimSwatch's heuristic
  });

  it('is case-insensitive and idempotent: re-applying the same group does not duplicate the tag', () => {
    const lead = deviceEntry('Lead Tone');
    library.entries = [lead];

    library.applyColorLabelGroups([RED_GROUP(['lead tone'])]);
    const second = library.applyColorLabelGroups([RED_GROUP(['Lead Tone'])]);

    expect(library.tags[lead.id]).toEqual(['Red']);
    expect(second.tagged).toBe(0); // nothing new happened, no phantom re-persist
  });

  it('only matches device-slot entries, not file/local/converted copies of the same name', () => {
    const deviceLead = deviceEntry('Lead Tone');
    const fileLead = fileEntry('Lead Tone');
    library.entries = [deviceLead, fileLead];

    library.applyColorLabelGroups([RED_GROUP(['Lead Tone'])]);

    expect(library.tags[deviceLead.id]).toEqual(['Red']);
    expect(library.tags[fileLead.id]).toBeUndefined();
  });

  it('reports names with no device match as unmatched, without touching tags', () => {
    library.entries = [deviceEntry('Clean')];
    const result = library.applyColorLabelGroups([RED_GROUP(['Ghost Preset'])]);
    expect(result.unmatched).toEqual(['Ghost Preset']);
    expect(result.tagged).toBe(0);
    expect(library.tagColors['Red']).toBeUndefined(); // no phantom color for a group that matched nothing
  });

  it('skipIds leaves a provenance-excluded id untouched (respects a user removal/rename)', () => {
    const lead = deviceEntry('Lead Tone');
    library.entries = [lead];

    const result = library.applyColorLabelGroups([RED_GROUP(['Lead Tone'])], { skipIds: { Red: [lead.id] } });

    expect(library.tags[lead.id]).toBeUndefined();
    expect(result.tagged).toBe(0);
    expect(result.matchedIds['Red']).toEqual([lead.id]); // still reported so the caller can track provenance
  });

  it('never overrides a tag color the user (or a prior import) already set', () => {
    const lead = deviceEntry('Lead Tone');
    library.entries = [lead];
    library.tagColors = { Red: 5 }; // manual override

    library.applyColorLabelGroups([RED_GROUP(['Lead Tone'])]);

    expect(library.tagColors['Red']).toBe(5);
  });
});
