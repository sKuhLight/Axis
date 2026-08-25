import { describe, expect, it } from 'vitest';

import { fallbackSwatch } from './tagColors';
import { renameTagAssignments, renameTagColorKey } from './tagRename';

describe('renameTagAssignments', () => {
  it('rewrites the tag on every preset that carries it', () => {
    const tags = { 'dev:1': ['Cruch', 'Clean'], 'dev:2': ['Cruch'], 'dev:3': ['Ambient'] };
    expect(renameTagAssignments(tags, 'Cruch', 'Crunch')).toEqual({
      'dev:1': ['Crunch', 'Clean'],
      'dev:2': ['Crunch'],
      'dev:3': ['Ambient']
    });
  });

  it('keeps each tag in its original position', () => {
    const tags = { 'dev:1': ['Ambient', 'Cruch', 'Clean'] };
    expect(renameTagAssignments(tags, 'Cruch', 'Zeta')['dev:1']).toEqual(['Ambient', 'Zeta', 'Clean']);
  });

  it('merges onto a tag the preset already carries, keeping the first position', () => {
    const tags = { 'dev:1': ['Crunch', 'Cruch'], 'dev:2': ['Cruch', 'Crunch'] };
    expect(renameTagAssignments(tags, 'Cruch', 'Crunch')).toEqual({
      'dev:1': ['Crunch'],
      'dev:2': ['Crunch']
    });
  });

  it('matches the source tag case-insensitively', () => {
    const tags = { 'dev:1': ['CRUCH'], 'dev:2': ['cruch'] };
    expect(renameTagAssignments(tags, 'Cruch', 'Crunch')).toEqual({
      'dev:1': ['Crunch'],
      'dev:2': ['Crunch']
    });
  });

  it('recases a tag when only the capitalization changes', () => {
    const tags = { 'dev:1': ['crunch', 'Clean'] };
    expect(renameTagAssignments(tags, 'crunch', 'Crunch')['dev:1']).toEqual(['Crunch', 'Clean']);
  });

  it('leaves the map alone when no preset carries the tag', () => {
    const tags = { 'dev:1': ['Clean'] };
    expect(renameTagAssignments(tags, 'Nothing', 'Something')).toEqual({ 'dev:1': ['Clean'] });
  });

  it('does not mutate its input', () => {
    const tags = { 'dev:1': ['Cruch'] };
    renameTagAssignments(tags, 'Cruch', 'Crunch');
    expect(tags).toEqual({ 'dev:1': ['Cruch'] });
  });

  it('handles an empty map', () => {
    expect(renameTagAssignments({}, 'Cruch', 'Crunch')).toEqual({});
  });
});

describe('renameTagColorKey', () => {
  it('moves the swatch index to the new name', () => {
    expect(renameTagColorKey({ Cruch: 4, Clean: 1 }, 'Cruch', 'Crunch')).toEqual({ Clean: 1, Crunch: 4 });
  });

  it('re-keys in place on a recase, preserving the index', () => {
    expect(renameTagColorKey({ crunch: 6 }, 'crunch', 'Crunch')).toEqual({ Crunch: 6 });
  });

  it('lets the target keep its own color when merging', () => {
    // Merging Cruch into Crunch: Crunch is the surviving tag, so it stays the color it already was.
    expect(renameTagColorKey({ Cruch: 4, Crunch: 2 }, 'Cruch', 'Crunch')).toEqual({ Crunch: 2 });
  });

  it('matches the target case-insensitively when merging', () => {
    expect(renameTagColorKey({ Cruch: 4, Crunch: 2 }, 'Cruch', 'crunch')).toEqual({ Crunch: 2 });
  });

  it('finds the source key case-insensitively', () => {
    expect(renameTagColorKey({ CRUCH: 5 }, 'cruch', 'Crunch')).toEqual({ Crunch: 5 });
  });

  // colorOf hashes the tag TEXT when nothing is stored, so without pinning, a rename would recolor
  // the tag. Pin what the user was already looking at.
  it('pins the fallback color when the source has no stored entry', () => {
    expect(renameTagColorKey({ Clean: 1 }, 'Cruch', 'Crunch')).toEqual({
      Clean: 1,
      Crunch: fallbackSwatch('Cruch')
    });
  });

  it('leaves the map alone when neither name has a stored color and the target is committed', () => {
    const colors = { Crunch: 2 };
    expect(renameTagColorKey(colors, 'Cruch', 'Crunch')).toBe(colors);
  });

  it('does not mutate its input', () => {
    const colors = { Cruch: 4 };
    renameTagColorKey(colors, 'Cruch', 'Crunch');
    expect(colors).toEqual({ Cruch: 4 });
  });
});
