import { describe, expect, it } from 'vitest';
import type { ConverterBlock } from '$lib/api/types';
import { modelsFromConverterBlocks } from './converterModels';

function block(family: string, typeName?: string): ConverterBlock {
  return { key: `${family}-1`, family, instance: 1, typeName, params: [] };
}

describe('modelsFromConverterBlocks', () => {
  it('groups type names by lowercased family, keeping first-seen casing', () => {
    const models = modelsFromConverterBlocks([block('AMP', 'Plexi 100W'), block('amp', 'HIPOWER'), block('Drive', 'TS808 OD')]);
    expect(models).toEqual({ amp: ['Plexi 100W', 'HIPOWER'], drive: ['TS808 OD'] });
  });

  it('de-dupes a model used by two blocks of the same family', () => {
    const models = modelsFromConverterBlocks([block('amp', 'Plexi 100W'), block('amp', 'plexi 100w')]);
    expect(models).toEqual({ amp: ['Plexi 100W'] });
  });

  it('skips blocks with no family or no resolved type', () => {
    const models = modelsFromConverterBlocks([block('', 'Plexi 100W'), block('amp', undefined), block('amp', '   ')]);
    expect(models).toEqual({});
  });
});
