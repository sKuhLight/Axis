import { describe, expect, it } from 'vitest';
import { createAxisWorkbenchDefaultDocument, pruneAxisRetiredNavigationEntries } from '../axisWorkbenchDefaults';
import { selectActiveLayout } from '../../workbench';

/** A persisted doc minted before Theme was folded into the Axis hub carried this entry. */
function withRetiredThemeEntry() {
  const doc = createAxisWorkbenchDefaultDocument();
  const layout = selectActiveLayout(doc)!;
  layout.navigation.entries.theme = { id: 'theme', label: 'Theme', hidden: false, target: { command: 'axis.openTheme' } };
  layout.navigation.order = [...layout.navigation.order, 'theme'];
  return { doc, layout };
}

describe('pruneAxisRetiredNavigationEntries — persisted-doc migration', () => {
  it('strips the retired Theme nav entry and its order slot', () => {
    const { doc, layout } = withRetiredThemeEntry();

    pruneAxisRetiredNavigationEntries(doc);

    expect(layout.navigation.entries.theme).toBeUndefined();
    expect(layout.navigation.order).not.toContain('theme');
  });

  it('keeps the Axis (account) entry untouched', () => {
    const { doc, layout } = withRetiredThemeEntry();

    pruneAxisRetiredNavigationEntries(doc);

    expect(layout.navigation.entries.account).toMatchObject({ label: 'Axis' });
    expect(layout.navigation.order).toContain('account');
  });

  it('is idempotent and never crashes on a clean document', () => {
    const { doc } = withRetiredThemeEntry();
    const once = pruneAxisRetiredNavigationEntries(doc);
    const orderOnce = selectActiveLayout(once)!.navigation.order;
    expect(() => pruneAxisRetiredNavigationEntries(once)).not.toThrow();
    expect(selectActiveLayout(once)!.navigation.order).toEqual(orderOnce);
    expect(selectActiveLayout(createAxisWorkbenchDefaultDocument())!.navigation.entries.theme).toBeUndefined();
  });
});
