import { describe, expect, it } from 'vitest';
import { normalizeTemplateName, templateNameProblem } from './templateName';

describe('normalizeTemplateName', () => {
  it('trims and strips a trailing .syx', () => {
    expect(normalizeTemplateName('  Clean Amp.syx ')).toBe('Clean Amp');
  });

  it('caps at the server limit of 64 characters', () => {
    expect(normalizeTemplateName('x'.repeat(80))).toHaveLength(64);
  });
});

describe('templateNameProblem', () => {
  it('accepts an ordinary name', () => {
    expect(templateNameProblem('Clean Amp')).toBeNull();
  });

  it('rejects empty, path-hostile, leading-dot, and non-ASCII names', () => {
    expect(templateNameProblem('   ')).toBeTruthy();
    expect(templateNameProblem('../escape')).toBeTruthy();
    expect(templateNameProblem('foo/bar')).toBeTruthy();
    expect(templateNameProblem('.hidden')).toBeTruthy();
    expect(templateNameProblem('Café')).toBeTruthy();
  });
});
