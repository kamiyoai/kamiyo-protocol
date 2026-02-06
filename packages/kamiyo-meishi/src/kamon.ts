import type { MeishiPassport, KamonParams, KamonRenderOptions, ComplianceClass } from './types.js';

const KAMON_STYLES = ['geometric', 'organic', 'radial', 'lattice'] as const;

const ELEMENTS = [
  'circle', 'hexagon', 'diamond', 'triangle',
  'cross', 'star', 'wave', 'leaf',
  'spiral', 'shield', 'arrow', 'eye',
] as const;

const COMPLIANCE_COLORS: Record<number, string> = {
  0: '#6b7280', // Unclassified: gray
  1: '#22c55e', // Minimal: green
  2: '#eab308', // Limited: amber
  3: '#f97316', // High: orange
  4: '#ef4444', // Unacceptable: red
};

const JURISDICTION_LABELS: Record<number, string> = {
  0: 'GLB',
  1: 'EU',
  2: 'US',
  3: 'UK',
  4: 'APAC',
};

/**
 * Derive visual Kamon parameters from on-chain data.
 * Deterministic: same passport data always produces same Kamon.
 */
export function deriveKamonParams(kamonHash: number[]): KamonParams {
  return {
    symmetry: (kamonHash[0] % 8) + 4,
    complexity: (kamonHash[1] % 5) + 1,
    style: KAMON_STYLES[kamonHash[2] % KAMON_STYLES.length],
    primaryElement: ELEMENTS[kamonHash[3] % ELEMENTS.length],
  };
}

/**
 * Generate SVG Kamon crest from passport data.
 */
export function generateKamonSVG(
  kamonHash: number[],
  options: KamonRenderOptions
): string {
  const params = deriveKamonParams(kamonHash);
  const { size, complianceClass, jurisdiction, suspended } = options;

  const borderColor = suspended ? '#ef4444' : (COMPLIANCE_COLORS[complianceClass] ?? '#6b7280');
  const center = size / 2;
  const radius = size * 0.35;

  let elements = '';

  // Generate symmetrical pattern based on params
  for (let i = 0; i < params.symmetry; i++) {
    const angle = (i * 2 * Math.PI) / params.symmetry;
    const x = center + Math.cos(angle) * radius * 0.6;
    const y = center + Math.sin(angle) * radius * 0.6;

    const elementSize = radius * 0.15 * (1 + (kamonHash[4 + (i % 20)] % 3) * 0.2);

    switch (params.primaryElement) {
      case 'circle':
        elements += `<circle cx="${x}" cy="${y}" r="${elementSize}" fill="none" stroke="#1a1a2e" stroke-width="1.5"/>`;
        break;
      case 'hexagon': {
        const pts = Array.from({ length: 6 }, (_, j) => {
          const a = (j * Math.PI) / 3 + angle;
          return `${x + Math.cos(a) * elementSize},${y + Math.sin(a) * elementSize}`;
        }).join(' ');
        elements += `<polygon points="${pts}" fill="none" stroke="#1a1a2e" stroke-width="1.5"/>`;
        break;
      }
      case 'diamond':
        elements += `<rect x="${x - elementSize}" y="${y - elementSize}" width="${elementSize * 2}" height="${elementSize * 2}" fill="none" stroke="#1a1a2e" stroke-width="1.5" transform="rotate(45 ${x} ${y})"/>`;
        break;
      default:
        elements += `<circle cx="${x}" cy="${y}" r="${elementSize}" fill="none" stroke="#1a1a2e" stroke-width="1.5"/>`;
    }

    // Inner layer for complexity
    if (params.complexity >= 3) {
      const innerX = center + Math.cos(angle) * radius * 0.3;
      const innerY = center + Math.sin(angle) * radius * 0.3;
      elements += `<circle cx="${innerX}" cy="${innerY}" r="${elementSize * 0.5}" fill="#1a1a2e" opacity="0.3"/>`;
    }
  }

  // Connecting lines for complexity >= 2
  if (params.complexity >= 2) {
    for (let i = 0; i < params.symmetry; i++) {
      const angle1 = (i * 2 * Math.PI) / params.symmetry;
      const angle2 = ((i + 1) * 2 * Math.PI) / params.symmetry;
      const x1 = center + Math.cos(angle1) * radius * 0.6;
      const y1 = center + Math.sin(angle1) * radius * 0.6;
      const x2 = center + Math.cos(angle2) * radius * 0.6;
      const y2 = center + Math.sin(angle2) * radius * 0.6;
      elements += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1a1a2e" stroke-width="0.8" opacity="0.4"/>`;
    }
  }

  // Central element
  elements += `<circle cx="${center}" cy="${center}" r="${radius * 0.12}" fill="#1a1a2e"/>`;

  // Jurisdiction badge
  const jurisdictionLabel = JURISDICTION_LABELS[jurisdiction] ?? 'GLB';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <filter id="glow"><feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <!-- Background -->
  <rect width="${size}" height="${size}" fill="#fafafa" rx="8"/>
  <!-- Border ring (compliance status) -->
  <circle cx="${center}" cy="${center}" r="${radius + 8}" fill="none" stroke="${borderColor}" stroke-width="3" ${suspended ? 'stroke-dasharray="8 4"' : ''}/>
  <circle cx="${center}" cy="${center}" r="${radius + 4}" fill="none" stroke="${borderColor}" stroke-width="1" opacity="0.4"/>
  <!-- Kamon pattern -->
  ${elements}
  <!-- Jurisdiction badge -->
  <rect x="${size - 38}" y="6" width="32" height="16" rx="3" fill="${borderColor}"/>
  <text x="${size - 22}" y="17" text-anchor="middle" font-size="9" font-family="monospace" fill="white" font-weight="bold">${jurisdictionLabel}</text>
</svg>`;
}

/**
 * Generate Kamon from a MeishiPassport account.
 */
export function generateKamonFromPassport(
  passport: MeishiPassport,
  size: number = 256
): string {
  return generateKamonSVG(passport.kamonHash, {
    size,
    complianceClass: passport.complianceClass,
    jurisdiction: passport.jurisdiction,
    suspended: passport.suspended,
  });
}
