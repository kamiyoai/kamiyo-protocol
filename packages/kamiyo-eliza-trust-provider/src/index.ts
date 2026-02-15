import { kamiyoTrustProfileProvider } from './providers/trustProfile';
import { kamiyoSecurityStatusProvider } from './providers/securityStatus';
import { kamiyoTrustEvidenceBridgeService } from './services/evidenceBridge';
import type { Plugin } from './types';

export const kamiyoTrustPlugin: Plugin = {
  name: 'kamiyo-trust',
  description: 'KAMIYO on-chain trust bridge for ElizaOS plugin-trust. Maps stake, escrow, and oracle data to TrustEvidence records.',
  providers: [kamiyoTrustProfileProvider, kamiyoSecurityStatusProvider],
  services: [kamiyoTrustEvidenceBridgeService],
};

export { kamiyoTrustProfileProvider } from './providers/trustProfile';
export { kamiyoSecurityStatusProvider } from './providers/securityStatus';
export { KamiyoTrustEvidenceBridge, kamiyoTrustEvidenceBridgeService } from './services/evidenceBridge';
export { EVIDENCE_MAP } from './types';
export type {
  TrustEvidenceRecord,
  TrustEngineService,
  TrustProfile,
  KamiyoEventType,
  TrustEvidenceType,
  EvidenceMapping,
} from './types';

export default kamiyoTrustPlugin;
