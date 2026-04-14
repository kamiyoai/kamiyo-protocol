import { createHmac, createSign } from 'crypto';
import type {
  KizunaDecisionEnvelopeV1,
  KizunaDecisionEnvelopeV1Payload,
  KizunaDecisionEnvelopeV2,
  KizunaDecisionEnvelopeV2Payload,
} from '../../src/services/kizuna-kernel';
import { canonicalString } from '../../src/services/kizuna-request-hash';

export function mintLegacyDecisionEnvelope(
  payload: KizunaDecisionEnvelopeV1Payload,
  secret: string,
  keyId = 'kid1'
): KizunaDecisionEnvelopeV1 {
  const issuedAt = Date.now();
  const unsigned: Omit<KizunaDecisionEnvelopeV1, 'signature'> = {
    version: 'kizuna-envelope-v1',
    keyId,
    issuedAt,
    expiresAt: issuedAt + 2 * 60_000,
    payload,
  };

  return {
    ...unsigned,
    signature: createHmac('sha256', secret).update(canonicalString(unsigned)).digest('hex'),
  };
}

export function mintV2DecisionEnvelope(params: {
  payload: KizunaDecisionEnvelopeV2Payload;
  privateKeyPem: string;
  kid?: string;
}): KizunaDecisionEnvelopeV2 {
  const issuedAt = Date.now();
  const unsigned: Omit<KizunaDecisionEnvelopeV2, 'signature'> = {
    version: 'kizuna-envelope-v2',
    alg: 'ES256',
    kid: params.kid || 'kernel-v2',
    issuedAt,
    expiresAt: issuedAt + 2 * 60_000,
    payload: params.payload,
  };

  const signer = createSign('SHA256');
  signer.update(canonicalString(unsigned));
  signer.end();

  return {
    ...unsigned,
    signature: signer.sign(params.privateKeyPem).toString('base64url'),
  };
}
