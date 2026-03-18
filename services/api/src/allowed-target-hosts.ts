function normalizeHost(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  const withoutScheme = trimmed.replace(/^[a-z]+:\/\//, '');
  const host = withoutScheme.split('/')[0]?.split(':')[0]?.trim();
  return host || null;
}

export function resolveAllowedTargetHosts(defaultHosts: readonly string[], configuredHosts: string | undefined): string[] {
  const configured = (configuredHosts || '')
    .split(/[,\n]/)
    .map((value) => normalizeHost(value))
    .filter((value): value is string => Boolean(value));

  return [...new Set([...defaultHosts, ...configured])];
}
