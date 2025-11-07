import { TokenApproval, RiskFlag } from '../types/approval.types.js';
import { DataService } from './data-service.js';
import { logger } from '../utils/logger.js';

export class RiskDetector {
  private dataService: DataService;
  private knownScamAddresses: Set<string>;
  private staleThresholdDays = 180; // 6 months

  constructor(dataService: DataService) {
    this.dataService = dataService;
    this.knownScamAddresses = new Set([
      // Known scam/malicious addresses can be added here
      // This would typically be loaded from a database or API
    ]);
  }

  async detectRisks(
    approvals: TokenApproval[]
  ): Promise<Record<string, RiskFlag[]>> {
    const riskMap: Record<string, RiskFlag[]> = {};

    for (const approval of approvals) {
      const risks: RiskFlag[] = [];

      // Check for unlimited approvals
      if (approval.is_unlimited) {
        risks.push({
          type: 'unlimited',
          severity: 'high',
          description: `Unlimited approval granted to ${approval.spender_address}. This allows the spender to drain all tokens.`,
        });
      }

      // Check for stale approvals
      const daysSinceUpdate = this.getDaysSince(approval.last_updated);
      if (daysSinceUpdate > this.staleThresholdDays) {
        risks.push({
          type: 'stale',
          severity: 'medium',
          description: `Approval is ${Math.round(
            daysSinceUpdate
          )} days old. Consider revoking unused approvals.`,
        });
      }

      // Check if spender protocol has been exploited
      const exploitRisk = await this.checkProtocolExploitHistory(
        approval.spender_address
      );
      if (exploitRisk) {
        risks.push(exploitRisk);
      }

      // Check for known suspicious addresses
      if (this.knownScamAddresses.has(approval.spender_address.toLowerCase())) {
        risks.push({
          type: 'suspicious_spender',
          severity: 'critical',
          description: `Spender address is flagged as suspicious or malicious. Revoke immediately.`,
        });
      }

      if (risks.length > 0) {
        const key = `${approval.token_address}-${approval.spender_address}`;
        riskMap[key] = risks;
      }
    }

    logger.info('Risk detection completed', {
      total_approvals: approvals.length,
      risky_approvals: Object.keys(riskMap).length,
    });

    return riskMap;
  }

  private async checkProtocolExploitHistory(
    spenderAddress: string
  ): Promise<RiskFlag | null> {
    try {
      // Try to identify the protocol from common router addresses
      const protocolMap: Record<string, string> = {
        '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D': 'uniswap-v2',
        '0xE592427A0AEce92De3Edee1F18E0157C05861564': 'uniswap-v3',
        '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45': 'uniswap',
        '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F': 'sushiswap',
        '0x1111111254fb6c44bAC0beD2854e76F90643097d': '1inch',
        '0xDef1C0ded9bec7F1a1670819833240f027b25EfF': '0x',
      };

      const protocol = protocolMap[spenderAddress];
      if (!protocol) {
        return null;
      }

      // Fetch exploit data for this protocol
      const exploits = await this.dataService.fetchExploits(protocol, undefined);

      if (exploits.length === 0) {
        return null;
      }

      // Check for recent exploits (last 90 days)
      const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
      const recentExploits = exploits.filter(
        (e) => new Date(e.timestamp).getTime() > ninetyDaysAgo
      );

      if (recentExploits.length > 0) {
        const criticalExploits = recentExploits.filter(
          (e) => e.severity === 'critical' || e.severity === 'high'
        );

        if (criticalExploits.length > 0) {
          return {
            type: 'exploited_protocol',
            severity: 'critical',
            description: `Protocol ${protocol} has had ${criticalExploits.length} critical/high severity exploit(s) in the last 90 days. Exercise extreme caution.`,
          };
        }

        return {
          type: 'exploited_protocol',
          severity: 'high',
          description: `Protocol ${protocol} has had ${recentExploits.length} exploit(s) in the last 90 days. Review before interaction.`,
        };
      }

      // Check for any historical exploits
      if (exploits.length > 0) {
        return {
          type: 'exploited_protocol',
          severity: 'medium',
          description: `Protocol ${protocol} has historical exploit records. Total incidents: ${exploits.length}.`,
        };
      }

      return null;
    } catch (error) {
      logger.error('Failed to check protocol exploit history', error, {
        spender: spenderAddress,
      });
      return null;
    }
  }

  private getDaysSince(dateString: string): number {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    return diffMs / (1000 * 60 * 60 * 24);
  }

  addScamAddress(address: string): void {
    this.knownScamAddresses.add(address.toLowerCase());
  }

  getScamAddressCount(): number {
    return this.knownScamAddresses.size;
  }
}
