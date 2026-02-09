export function normalizeSkillTag(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return '';

  let out = trimmed.replace(/\s+/g, '_').replace(/-+/g, '_');
  out = out.replace(/[^a-z0-9_]/g, '');
  out = out.replace(/^_+|_+$/g, '');

  if (!out) return '';
  if (out.length > 32) out = out.slice(0, 32);
  out = out.replace(/^_+|_+$/g, '');

  if (!out) return '';
  if (!/^[a-z0-9]/.test(out)) out = out.replace(/^[^a-z0-9]+/, '');
  if (!/[a-z0-9]$/.test(out)) out = out.replace(/[^a-z0-9]+$/, '');
  return out;
}

