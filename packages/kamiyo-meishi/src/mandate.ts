import { PublicKey } from '@solana/web3.js';
import { MeishiClient } from './client.js';
import type { MeishiMandate, UpdateMandateParams } from './types.js';

export class MandateManager {
  constructor(private client: MeishiClient) {}

  async get(passportAddress: PublicKey, version: number): Promise<MeishiMandate | null> {
    return this.client.getMandate(passportAddress, version);
  }

  async getLatest(passportAddress: PublicKey): Promise<MeishiMandate | null> {
    return this.client.getLatestMandate(passportAddress);
  }

  isValid(mandate: MeishiMandate): boolean {
    const now = Math.floor(Date.now() / 1000);
    return (
      !mandate.revoked &&
      mandate.validFrom.toNumber() <= now &&
      mandate.validUntil.toNumber() > now
    );
  }

  isExpired(mandate: MeishiMandate): boolean {
    const now = Math.floor(Date.now() / 1000);
    return mandate.validUntil.toNumber() <= now;
  }

  checkCategory(mandate: MeishiMandate, category: number): boolean {
    const byteIndex = Math.floor(category / 8);
    const bitIndex = category % 8;
    if (byteIndex >= mandate.categoryWhitelist.length) return false;
    return (mandate.categoryWhitelist[byteIndex] & (1 << bitIndex)) !== 0;
  }

  checkSpendingLimit(mandate: MeishiMandate, amountMicroUsd: number): boolean {
    return amountMicroUsd <= mandate.spendingLimitUsd.toNumber();
  }

  requiresHumanApproval(mandate: MeishiMandate, amountMicroUsd: number): boolean {
    return amountMicroUsd > mandate.requiresHumanApprovalAbove.toNumber();
  }

  checkGeoRestriction(mandate: MeishiMandate, jurisdiction: number): boolean {
    // Global (0) passes all geo checks; specific jurisdictions map to bits 0-3
    // Bitmap: bit 0 = EU(1), bit 1 = US(2), bit 2 = UK(3), bit 3 = APAC(4)
    if (jurisdiction === 0) return true; // Global
    const bitIndex = jurisdiction - 1;
    if (bitIndex < 0 || bitIndex >= 8) return false;
    return (mandate.geoRestrictions & (1 << bitIndex)) !== 0;
  }

  static buildCategoryWhitelist(categories: number[]): number[] {
    const whitelist = new Array(32).fill(0);
    for (const cat of categories) {
      if (cat < 0 || cat > 255) continue;
      const byteIndex = Math.floor(cat / 8);
      const bitIndex = cat % 8;
      whitelist[byteIndex] |= 1 << bitIndex;
    }
    return whitelist;
  }

  static buildGeoRestrictions(jurisdictions: number[]): number {
    let bitmap = 0;
    for (const j of jurisdictions) {
      if (j >= 0 && j < 8) {
        bitmap |= 1 << j;
      }
    }
    return bitmap;
  }
}
