import { KMSClient, GetPublicKeyCommand, SignCommand } from '@aws-sdk/client-kms';
import { createHash, createPrivateKey, createPublicKey, createSign } from 'node:crypto';
import { getConfig } from '../config.js';
import type { KizunaLane } from '../policy/index.js';
import { canonicalString } from './request-hash.js';

export interface KizunaDecisionEnvelopeV2Payload {
  decisionId: string;
  agentId: string;
  payerWallet: string;
  repayWallet: string;
  requestNonce: string;
  network: string;
  lane: KizunaLane;
  poolId: string;
  approvedMicro: string;
  policyPackId: string;
  policyPackVersion: string;
  riskLevel: string;
  riskAction: 'none' | 'freeze' | 'throttle' | 'unfreeze';
  requestHash: string;
  ltvBps?: number;
  healthFactor?: number;
}

export interface KizunaDecisionEnvelopeV2 {
  version: 'kizuna-envelope-v2';
  alg: 'ES256';
  kid: string;
  issuedAt: number;
  expiresAt: number;
  payload: KizunaDecisionEnvelopeV2Payload;
  signature: string;
}

export interface SigningContext {
  kid: string;
  publicKeyPem: string;
  sign(material: string): Promise<string>;
}

function toBase64Url(value: Buffer): string {
  return value.toString('base64url');
}

function toPem(type: 'PUBLIC KEY', body: Buffer): string {
  const base64 = body.toString('base64');
  const lines = base64.match(/.{1,64}/g) || [];
  return `-----BEGIN ${type}-----\n${lines.join('\n')}\n-----END ${type}-----`;
}

function buildMaterial(envelope: Omit<KizunaDecisionEnvelopeV2, 'signature'>): string {
  return canonicalString(envelope);
}

async function createAwsKmsSigningContext(): Promise<SigningContext> {
  const config = getConfig();
  const kid = config.KIZUNA_KERNEL_ACTIVE_SIGNING_KID;
  const keyId = config.KIZUNA_KERNEL_AWS_KMS_KEY_IDS[kid];
  if (!keyId) {
    throw new Error(`missing_kms_key_for_kid:${kid}`);
  }

  const client = new KMSClient({ region: config.KIZUNA_KERNEL_AWS_REGION });
  const publicKeyResult = await client.send(new GetPublicKeyCommand({ KeyId: keyId }));
  if (!publicKeyResult.PublicKey) {
    throw new Error(`kms_public_key_missing:${kid}`);
  }

  const publicKeyPem = toPem('PUBLIC KEY', Buffer.from(publicKeyResult.PublicKey));

  return {
    kid,
    publicKeyPem,
    async sign(material: string): Promise<string> {
      const result = await client.send(
        new SignCommand({
          KeyId: keyId,
          Message: Buffer.from(material),
          MessageType: 'RAW',
          SigningAlgorithm: 'ECDSA_SHA_256',
        })
      );
      if (!result.Signature) {
        throw new Error(`kms_signature_missing:${kid}`);
      }
      return toBase64Url(Buffer.from(result.Signature));
    },
  };
}

async function createLocalSigningContext(): Promise<SigningContext> {
  const config = getConfig();
  const kid = config.KIZUNA_KERNEL_ACTIVE_SIGNING_KID;
  const pem = config.KIZUNA_KERNEL_LOCAL_PRIVATE_KEYS[kid];
  if (!pem) {
    throw new Error(`missing_local_private_key:${kid}`);
  }

  const privateKey = createPrivateKey(pem);
  const publicKeyPem = createPublicKey(privateKey).export({ format: 'pem', type: 'spki' }).toString();

  return {
    kid,
    publicKeyPem,
    async sign(material: string): Promise<string> {
      const signer = createSign('SHA256');
      signer.update(material);
      signer.end();
      return toBase64Url(signer.sign(privateKey));
    },
  };
}

let signingContextPromise: Promise<SigningContext> | null = null;

export function clearSigningContextCache(): void {
  signingContextPromise = null;
}

export async function getSigningContext(): Promise<SigningContext> {
  if (signingContextPromise) {
    return signingContextPromise;
  }

  const config = getConfig();
  signingContextPromise =
    config.KIZUNA_KERNEL_SIGNING_BACKEND === 'aws-kms'
      ? createAwsKmsSigningContext()
      : createLocalSigningContext();
  return signingContextPromise;
}

export function hashRequestMaterial(material: string): string {
  return createHash('sha256').update(material).digest('hex');
}

export async function mintDecisionEnvelope(params: {
  payload: KizunaDecisionEnvelopeV2Payload;
  ttlMs: number;
}): Promise<KizunaDecisionEnvelopeV2> {
  const signingContext = await getSigningContext();
  const issuedAt = Date.now();
  const unsigned: Omit<KizunaDecisionEnvelopeV2, 'signature'> = {
    version: 'kizuna-envelope-v2',
    alg: 'ES256',
    kid: signingContext.kid,
    issuedAt,
    expiresAt: issuedAt + params.ttlMs,
    payload: params.payload,
  };

  return {
    ...unsigned,
    signature: await signingContext.sign(buildMaterial(unsigned)),
  };
}

export function getEnvelopeMaterial(
  envelope: Omit<KizunaDecisionEnvelopeV2, 'signature'>
): string {
  return buildMaterial(envelope);
}
