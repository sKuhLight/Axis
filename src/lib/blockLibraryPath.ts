const EDITOR_DIRECTORY: Record<string, string> = {
  fm3: 'FM3-Edit',
  fm9: 'FM9-Edit',
  axefxiii: 'Axe-Edit III'
};

/** Default Fractal Edit block-library path for a detected supported unit. */
export function defaultBlockLibraryPath(unit: string | null | undefined): string | null {
  const key = unit?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '') ?? '';
  const editor = EDITOR_DIRECTORY[key];
  return editor ? `~/Documents/Fractal Audio/${editor}/blocks` : null;
}
