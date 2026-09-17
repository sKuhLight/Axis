const EDITOR_DIRECTORY: Record<string, string> = {
  fm3: 'FM3-Edit',
  fm9: 'FM9-Edit',
  axefxiii: 'Axe-Edit III'
};

const editorDirFor = (unit: string | null | undefined): string | null => {
  const key = unit?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '') ?? '';
  return EDITOR_DIRECTORY[key] ?? null;
};

/** Default Fractal Edit block-library path for a detected supported unit. */
export function defaultBlockLibraryPath(unit: string | null | undefined): string | null {
  const editor = editorDirFor(unit);
  return editor ? `~/Documents/Fractal Audio/${editor}/blocks` : null;
}

/** Default Fractal Edit preset-templates path for a detected supported unit — the editor's own
 *  `presets/templates` folder (plain preset `.syx` files; see FM3-Edit's "Save as Template"). */
export function defaultPresetTemplatesPath(unit: string | null | undefined): string | null {
  const editor = editorDirFor(unit);
  return editor ? `~/Documents/Fractal Audio/${editor}/presets/templates` : null;
}
