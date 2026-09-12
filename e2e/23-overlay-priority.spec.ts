import { test, expect } from '@playwright/test';
import { bootCleanWorkbench } from './support/workbench';

test.describe('Overlay priority', () => {
  test('registry controls dialog stacking, focus, Escape, prompts, and picker cleanup', async ({ page }) => {
    await bootCleanWorkbench(page);

    await page.evaluate(async () => {
      const [{ editor }, { overlays }] = await Promise.all([
        import('/src/lib/editor/editor.svelte.ts'),
        import('/src/lib/overlay/overlays.svelte.ts')
      ]);
      editor.themeOpen = true;
      editor.presetSearchOpen = true;
      overlays.open('presetPicker');
      editor.presetPick = () => {};
      overlays.close('presetPicker');
    });

    expect(await page.evaluate(async () => {
      const { editor } = await import('/src/lib/editor/editor.svelte.ts');
      return editor.presetPick === null;
    })).toBe(true);

    const theme = page.locator('[data-overlay="theme"]');
    const search = page.locator('[data-overlay="presetSearch"]');
    await expect(theme).toBeVisible();
    await expect(search).toBeVisible();
    await expect(search.locator('input')).toBeFocused();
    expect(await search.evaluate((el) => Number(getComputedStyle(el).zIndex)))
      .toBeGreaterThan(await theme.evaluate((el) => Number(getComputedStyle(el).zIndex)));

    await page.keyboard.press('Escape');
    await expect(search).toHaveCount(0);
    await expect(theme).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(theme).toBeVisible();

    await page.evaluate(async () => {
      const { editor } = await import('/src/lib/editor/editor.svelte.ts');
      editor.paletteOpen = true;
      editor.reportPrompt = { kind: 'test' };
      editor.consentPromptOpen = true;
    });

    const consent = page.locator('[data-overlay="consentPrompt"]');
    await expect(consent).toBeVisible();
    await expect.poll(() => page.evaluate(() =>
      document.activeElement?.closest('[data-overlay]')?.getAttribute('data-overlay')
    )).toBe('consentPrompt');
    await page.keyboard.press('Escape');
    await expect(consent).toBeVisible();
    await expect(page.locator('[data-overlay="reportPrompt"]')).toBeVisible();
    await expect(page.locator('[data-overlay="palette"]')).toBeVisible();

    await page.evaluate(async () => {
      const { editor } = await import('/src/lib/editor/editor.svelte.ts');
      editor.consentPromptOpen = false;
    });
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-overlay="reportPrompt"]')).toHaveCount(0);
    await expect(page.locator('[data-overlay="palette"]')).toBeVisible();
  });

  test('an inner surface that claims Escape keeps the overlay behind it open', async ({ page }) => {
    await bootCleanWorkbench(page);
    await page.evaluate(async () => {
      const { editor } = await import('/src/lib/editor/editor.svelte.ts');
      editor.paletteOpen = true;
    });

    const palette = page.locator('[data-overlay="palette"]');
    await expect(palette).toBeVisible();

    // Stand-in for a sub-popover / inline rename inside a dialog: a handler that claims
    // Escape by stopping propagation, and one that claims it with preventDefault alone.
    // Either way the registry must leave the dialog alone.
    await palette.locator('input').first().evaluate((el) => {
      el.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Escape') e.stopPropagation();
      });
    });
    await page.keyboard.press('Escape');
    await expect(palette).toBeVisible();

    await palette.locator('input').first().evaluate((el) => {
      const clone = el.cloneNode(true) as HTMLElement;
      el.replaceWith(clone);
      clone.focus();
      clone.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Escape') e.preventDefault();
      });
    });
    await page.keyboard.press('Escape');
    await expect(palette).toBeVisible();

    // Nothing claims it — the registry closes the top overlay as before.
    await palette.locator('input').first().evaluate((el) => {
      const clone = el.cloneNode(true) as HTMLElement;
      el.replaceWith(clone);
      clone.focus();
    });
    await page.keyboard.press('Escape');
    await expect(palette).toHaveCount(0);
  });
});
