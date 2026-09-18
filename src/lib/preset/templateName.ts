// Client-side mirror of ForgeFX's template-name sanitizer (server/src/services/presetTemplates.ts):
// the same reasons the server would 400 on, surfaced as inline field errors before a round-trip.
// A template is written as `<name>.syx`, so the name is a filename fragment, not free text.

/** Trim, strip a trailing `.syx`, and cap at the server's 64-char limit. */
export function normalizeTemplateName(raw: string): string {
  return raw.trim().replace(/\.syx$/i, '').trim().slice(0, 64);
}

/** Human-readable problem with a template name, or null when it is acceptable. */
export function templateNameProblem(raw: string): string | null {
  const name = normalizeTemplateName(raw);
  if (!name) return 'Enter a name.';
  if (/[^\x20-\x7e]/.test(name)) return 'Use plain keyboard characters only.';
  if (/[\\/:*?"<>|]/.test(name)) return 'Names can’t contain \\ / : * ? " < > |';
  if (name.startsWith('.')) return 'Names can’t start with a dot.';
  return null;
}
