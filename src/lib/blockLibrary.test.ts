import { describe, expect, it } from 'vitest';
import { compatibleLibraryEntry, libraryParameters, planLibraryWrites, putBlockLibraryEntry, readBlockLibrary, removeBlockLibraryEntry } from './blockLibrary';
import type { BlockParams } from './types';

const block: BlockParams = {
  block: 'Amp',
  page: 1,
  type: { value: 7, name: 'Plexi 100W' },
  named: [
    { id: 1, name: 'Drive', value: 3, norm: 0.3 },
    { id: 2, name: 'Level meter', value: -3, norm: 0.8 },
    { id: 3, name: 'Input trim', value: 7 },
    { id: 4, name: 'Type', value: 7, norm: 0.23 }
  ],
  enums: [
    { id: 5, name: 'Bright', value: 1, options: [{ value: 0, label: 'Off' }, { value: 1, label: 'On' }] }
  ],
  layout: { family: 'DISTORT', pages: [{
    name: 'Gain',
    rows: [],
    pageControls: [{ label: 'Level', paramName: 'AMP_LEVEL', paramId: 2, widget: 'meter' }]
  }] }
};
const entry = {
  id: 'library-one',
  name: 'Clean Amp',
  model: 17,
  firmware: '12.00',
  family: 'amp',
  type: block.type,
  parameters: libraryParameters(block, 58)
};

describe('Block library', () => {
  it('remembers entries without loading malformed or duplicate records', () => {
    let stored = JSON.stringify([null, { ...entry, id: 'invalid', parameters: [{ continuous: true, value: Infinity }] }, entry, entry]);
    const storage = { getItem: () => stored, setItem: (_: string, next: string) => { stored = next; } };
    expect(readBlockLibrary(storage)).toEqual([entry]);
    putBlockLibraryEntry(storage, { ...entry, id: 'library-two' });
    removeBlockLibraryEntry(storage, entry.id);
    expect(readBlockLibrary(storage).map((item) => item.id)).toEqual(['library-two']);
  });

  it('captures writable ordinals and normalized knobs, excluding missing values and telemetry', () => {
    expect(entry.parameters).toEqual([
      { id: 5, name: 'Bright', value: 1, continuous: false },
      { id: 1, name: 'Drive', value: 0.3, continuous: true }
    ]);
  });

  it('only writes differences and rejects obsolete definitions before writing anything', () => {
    const other = { ...block, named: [{ id: 1, name: 'Drive', value: 6, norm: 0.6 }] };
    expect(planLibraryWrites(entry, other, 58)).toEqual([{ id: 1, name: 'Drive', value: 0.3, continuous: true }]);
    expect(() => planLibraryWrites(entry, { ...other, named: [{ ...other.named[0], name: 'Bass' }] }, 58)).toThrow('incompatible');
    expect(() => planLibraryWrites(entry, {
      ...other, enums: [{ ...block.enums[0], value: 0, options: [{ value: 0, label: 'Off' }] }]
    }, 58)).toThrow('incompatible');
    expect(compatibleLibraryEntry(entry, { ...entry, firmware: '13.00' })).toBe(false);
    expect(compatibleLibraryEntry(entry, { ...entry, family: 'drive' })).toBe(false);
  });
});
