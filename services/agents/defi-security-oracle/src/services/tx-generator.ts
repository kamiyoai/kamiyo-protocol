import {
  TokenApproval,
  RevocationTransaction,
  RiskFlag,
  CHAIN_IDS,
  SupportedChain,
} from '../types/approval.types.js';
import { logger } from '../utils/logger.js';

export class TransactionGenerator {
  generateRevocations(
    approvals: TokenApproval[],
    riskFlags: Record<string, RiskFlag[]>,
    chains: SupportedChain[]
  ): RevocationTransaction[] {
    const revocations: RevocationTransaction[] = [];

    for (const approval of approvals) {
      const key = `${approval.token_address}-${approval.spender_address}`;
      const risks = riskFlags[key];

      if (!risks || risks.length === 0) {
        continue;
      }

      // Only generate revocations for approvals with risks
      const highestSeverity = this.getHighestSeverity(risks);

      if (highestSeverity === 'low') {
        // Skip low severity risks
        continue;
      }

      const chainId = this.inferChainId(approval, chains);
      const revocation = this.createRevocationTx(approval, chainId, risks);

      revocations.push(revocation);
    }

    logger.info(`Generated ${revocations.length} revocation transactions`, {
      total_approvals: approvals.length,
    });

    return revocations;
  }

  private createRevocationTx(
    approval: TokenApproval,
    chainId: number,
    risks: RiskFlag[]
  ): RevocationTransaction {
    // ERC20 approve(address spender, uint256 amount) function
    // Function selector: 0x095ea7b3
    // Parameters: spender address (padded to 32 bytes), amount (0 for revocation)
    const functionSelector = '0x095ea7b3';
    const spenderPadded = approval.spender_address.slice(2).padStart(64, '0');
    const amountZero = '0'.padStart(64, '0');

    const data = `${functionSelector}${spenderPadded}${amountZero}`;

    const riskDescriptions = risks.map((r) => r.description).join(' | ');

    return {
      to: approval.token_address,
      data,
      value: '0',
      chainId,
      token_address: approval.token_address,
      spender_address: approval.spender_address,
      description: `Revoke ${approval.token_symbol} approval for ${approval.spender_address}. Risks: ${riskDescriptions}`,
    };
  }

  private getHighestSeverity(risks: RiskFlag[]): string {
    const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    let highest = 'low';
    let highestValue = 1;

    for (const risk of risks) {
      const value = severityOrder[risk.severity];
      if (value > highestValue) {
        highest = risk.severity;
        highestValue = value;
      }
    }

    return highest;
  }

  private inferChainId(
    approval: TokenApproval,
    chains: SupportedChain[]
  ): number {
    // Default to ethereum if multiple chains
    if (chains.length === 1) {
      return CHAIN_IDS[chains[0]];
    }

    // Could be improved by tracking which chain each approval came from
    // For now, default to Ethereum
    return CHAIN_IDS.ethereum;
  }

  generateBatchRevocation(
    revocations: RevocationTransaction[]
  ): {
    targets: string[];
    datas: string[];
    values: string[];
    chainId: number;
  } {
    // For advanced users with batch transaction capabilities (e.g., Gnosis Safe)
    const targets = revocations.map((r) => r.to);
    const datas = revocations.map((r) => r.data);
    const values = revocations.map((r) => r.value);
    const chainId = revocations[0]?.chainId || CHAIN_IDS.ethereum;

    return {
      targets,
      datas,
      values,
      chainId,
    };
  }
}
