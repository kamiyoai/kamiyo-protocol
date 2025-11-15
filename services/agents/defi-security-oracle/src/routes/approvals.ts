import { Request, Response } from 'express';
import { ApprovalScanner } from '../services/approval-scanner.js';
import { RiskDetector } from '../services/risk-detector.js';
import { TransactionGenerator } from '../services/tx-generator.js';
import { DataService } from '../services/data-service.js';
import {
  ApprovalAuditResponse,
  approvalAuditQuerySchema,
  SupportedChain,
} from '../types/approval.types.js';
import { logger } from '../utils/logger.js';

export class ApprovalsRouteHandler {
  private approvalScanner: ApprovalScanner;
  private riskDetector: RiskDetector;
  private txGenerator: TransactionGenerator;

  constructor(dataService: DataService) {
    this.approvalScanner = new ApprovalScanner();
    this.riskDetector = new RiskDetector(dataService);
    this.txGenerator = new TransactionGenerator();
  }

  async handleApprovalAudit(req: Request, res: Response): Promise<void> {
    try {
      const startTime = Date.now();

      // Parse and validate input
      const validationResult = approvalAuditQuerySchema.safeParse(req.query);

      if (!validationResult.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid input',
          details: validationResult.error.issues,
        });
        return;
      }

      const { wallet, chains } = validationResult.data;

      logger.info('Processing approval audit request', { wallet, chains });

      // Step 1: Scan wallet for approvals
      const approvals = await this.approvalScanner.scanWalletApprovals(
        wallet,
        chains as SupportedChain[]
      );

      if (approvals.length === 0) {
        res.json({
          success: true,
          wallet,
          chains,
          approvals: [],
          risk_flags: {},
          revoke_tx_data: [],
          total_approvals: 0,
          risky_approvals: 0,
          timestamp: new Date().toISOString(),
        } as ApprovalAuditResponse);
        return;
      }

      // Step 2: Detect risks
      const riskFlags = await this.riskDetector.detectRisks(approvals);

      // Step 3: Generate revocation transactions
      const revokeTxData = this.txGenerator.generateRevocations(
        approvals,
        riskFlags,
        chains as SupportedChain[]
      );

      const duration = Date.now() - startTime;

      logger.info('Approval audit completed', {
        wallet,
        duration_ms: duration,
        total_approvals: approvals.length,
        risky_approvals: Object.keys(riskFlags).length,
        revocations_generated: revokeTxData.length,
      });

      const response: ApprovalAuditResponse = {
        success: true,
        wallet,
        chains,
        approvals,
        risk_flags: riskFlags,
        revoke_tx_data: revokeTxData,
        total_approvals: approvals.length,
        risky_approvals: Object.keys(riskFlags).length,
        timestamp: new Date().toISOString(),
      };

      res.json(response);
    } catch (error) {
      logger.error('Approval audit request failed', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to process approval audit',
      });
    }
  }

  getCacheStats() {
    return {
      approval_scanner: this.approvalScanner.getCacheStats(),
    };
  }
}
