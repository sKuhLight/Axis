import { expect, test } from '@playwright/test';
import { AMP_EID, AMP_PARAMS, bootBlockEditorMock, openAmpEditor } from './support/blockEditorMock';
import type { LayoutControl } from '../src/lib/types';

const control = (id: number, label: string, widget: LayoutControl['widget']): LayoutControl => ({
  paramId: id, paramName: `AMP_${label.toUpperCase().replaceAll(' ', '')}`, widget, label
});

test('Amp layout keeps Input Trim on row two and refreshes the shared mixer when the type changes', async ({ page }) => {
  await bootBlockEditorMock(page, { channel: 'A' });
  let type = AMP_PARAMS.type.value;
  let writes = 0;
  await page.route(`**/api/preset/blocks/${AMP_EID}/type`, async (route) => {
    type = route.request().postDataJSON().value;
    writes++;
    await route.fulfill({ json: { ok: true } });
  });
  await page.route(`**/api/preset/blocks/${AMP_EID}/params`, async (route) => {
    const mixer = (reduced = false) => ({
      section: 'mixer', controls: [
        control(7, 'Level', 'knob'),
        ...(reduced ? [] : [
          control(11, 'Input Select', 'dropdown'),
          control(type === 7 ? 8 : 9, type === 7 ? 'Balance' : 'Depth', 'knob')
        ])
      ]
    });
    await route.fulfill({
      json: {
        ...AMP_PARAMS,
        type: { value: type, name: type === 7 ? 'Plexi 100W' : 'Recto Orange' },
        layout: {
          ...AMP_PARAMS.layout, variantValue: null,
          pages: [
            { name: 'Authentic', selectorParamName: 'AMP_TYPE', value: String(type), rows: [
              { controls: [control(0, 'Drive', 'knob'), control(14, 'Plate Monitor', 'meter')] },
              { controls: [control(6, 'Input Trim', 'knob')] },
              mixer()
            ] },
            { name: 'Ideal', rows: [{ controls: [control(1, 'Bass', 'knob')] }, mixer()] },
            { name: 'Speaker', rows: [{ controls: [control(26, 'Speaker Drive', 'knob')] }, mixer(true)] }
          ]
        }
      }
    });
  });

  await openAmpEditor(page);
  const fixed = page.locator('[data-be-fixed]');
  const authentic = page.locator('[data-be-page="Authentic"]');
  await expect(fixed.locator('[data-be-key="e11"]')).toHaveCount(1);
  await expect(authentic.locator('[data-be-key="e11"]')).toHaveCount(0);
  const trim = await authentic.locator('[data-be-key="k6"]').boundingBox();
  const drive = await authentic.locator('[data-be-key="k0"]').boundingBox();
  const monitor = await authentic.locator('[data-be-key="k14"]').boundingBox();
  expect(trim!.y).toBeGreaterThan(drive!.y);
  expect(trim!.y + trim!.height).toBeLessThanOrEqual(monitor!.y + monitor!.height + 1);

  await expect(fixed.locator('[data-be-key="k8"]')).toHaveCount(1);
  await page.locator('[data-be-type]').click();
  await page.getByRole('button', { name: /^Recto Orange/ }).click();
  await expect.poll(() => writes).toBe(1);
  await expect(page.locator('[data-be-type]')).toContainText('Recto Orange', { ignoreCase: true });
  await expect(fixed.locator('[data-be-key="k8"]')).toHaveCount(0);
  await expect(fixed.locator('[data-be-key="k9"]')).toHaveCount(1);
  await expect(fixed.locator('[data-be-key="e11"]')).toHaveCount(1);
});
