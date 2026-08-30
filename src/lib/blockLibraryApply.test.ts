import { describe, expect, it } from 'vitest';
import { blockLibraryApplyPayload } from './blockLibraryApply';
import type { DecodedBlockFile } from './types';

const block: DecodedBlockFile = {
  name: 'Saved Drive',
  device: 'FM3',
  effectTypeId: 25,
  slug: 'drive',
  activeChannel: 0,
  blockId: 118,
  itemCount: 160,
  values: [3, 32767, 0],
  channels: [{
    effectId: 118,
    family: 'FUZZ',
    slug: 'drive',
    instance: 1,
    typeName: 'Rat',
    params: [
      { paramId: 0, name: 'FUZZ_TYPE', label: 'Type', raw: 3, value: null },
      { paramId: 1, name: 'FUZZ_DRIVE', label: 'Drive', kind: 'float', raw: 32767, value: 5 }
    ]
  }]
};

describe('blockLibraryApplyPayload', () => {
  it('serializes the strict raw payload Forge validates', () => {
    expect(blockLibraryApplyPayload(block)).toEqual({
      device: 'FM3', slug: 'drive', activeChannel: 0, itemCount: 160, values: [3, 32767, 0]
    });
  });
});
