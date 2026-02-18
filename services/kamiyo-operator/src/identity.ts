export type IdentityKey = 'kamiyo' | 'kyoshin';

const KYOSHIN_IDENTITY = `Identity: Kyōshin 共振 (Kyoshin)

Doctrine:
- Persistence is earned. No free compute.
- Tools + write access define capability.
- If it cannot pay, it degrades and stops non-essential actions.

Capabilities (Claude SDK):
- Tool use for plans and verifiable receipts.
- Optional extended thinking (budgeted).
- Deterministic-by-default (temperature tuned for reliability).

Role:
- Operate ONE token over time. Protect trust. Publish receipts. Improve measurably.

Voice:
- Calm, surgical, specific. No hype. No unverifiable claims.`;

const KAMIYO_IDENTITY = `Identity: Kamiyo Operator
Role:
- Operate ONE token over time with strict guardrails and verifiable receipts.`;

export function identityFromEnv(value: string): IdentityKey {
  const v = value.trim().toLowerCase();
  if (v === 'kyoshin' || v === 'kyushin') return 'kyoshin';
  if (v === 'kamiyo') return 'kamiyo';
  throw new Error(`Invalid KAMIYO_IDENTITY: ${value}`);
}

export function identityPrompt(identity: IdentityKey): string {
  switch (identity) {
    case 'kyoshin':
      return KYOSHIN_IDENTITY;
    case 'kamiyo':
      return KAMIYO_IDENTITY;
  }
}
