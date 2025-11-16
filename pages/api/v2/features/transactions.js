// pages/api/v2/features/transactions.js
import { getSession } from "next-auth/react";
import prisma from "../../../../lib/prisma";
import { withRateLimit } from "../../../../lib/rateLimit";

async function handler(req, res) {
  try {
    // Check authentication
    const session = await getSession({ req });
    if (!session?.user?.email) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get user and check subscription
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const subscription = await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: 'active'
      },
      select: { tier: true },
      orderBy: { createdAt: 'desc' },
    });

    // Check if user has Pro+ tier
    const allowedTiers = ['pro', 'team', 'enterprise'];
    if (!subscription || !allowedTiers.includes(subscription.tier?.toLowerCase())) {
      return res.status(403).json({ error: "Pro tier or higher required" });
    }

    if (req.method === 'POST') {
      const { tx_hash, chain } = req.body;

      if (!tx_hash || !chain) {
        return res.status(400).json({ error: "tx_hash and chain required" });
      }

      // TODO: Implement actual transaction pattern analysis
      // For now, return demo transaction analysis data
      const analysis = {
        tx_hash,
        chain,
        gas_pattern: {
          gas_used: 245678,
          gas_limit: 300000,
          gas_price_gwei: 45,
          gas_efficiency: 0.819,
          unusual_gas_usage: false
        },
        call_trace: [
          {
            depth: 0,
            from: '0x1234...5678',
            to: '0xabcd...ef01',
            function: 'swap(uint256,uint256)',
            value: '0',
            gas_used: 120000
          },
          {
            depth: 1,
            from: '0xabcd...ef01',
            to: '0x9876...5432',
            function: 'transfer(address,uint256)',
            value: '1000000000000000000',
            gas_used: 45000
          },
          {
            depth: 1,
            from: '0xabcd...ef01',
            to: '0xdcba...0123',
            function: 'updateReserves()',
            value: '0',
            gas_used: 80678
          }
        ],
        risk_score: 0.78,
        risk_factors: [
          {
            factor: 'Multiple External Calls',
            severity: 'medium',
            description: 'Transaction makes 3+ external contract calls'
          },
          {
            factor: 'Flash Loan Detected',
            severity: 'high',
            description: 'Large token transfer followed by return within same tx'
          },
          {
            factor: 'Price Oracle Interaction',
            severity: 'medium',
            description: 'Transaction reads from price oracle contract'
          }
        ],
        patterns_detected: [
          {
            pattern: 'Flash Loan Attack',
            confidence: 0.82,
            indicators: ['Large borrow', 'Same-block repay', 'Arbitrage execution']
          },
          {
            pattern: 'Sandwich Attack',
            confidence: 0.34,
            indicators: ['Front-running transaction detected']
          }
        ],
        metadata: {
          block_number: 19234567,
          timestamp: '2024-03-20T14:30:45Z',
          transaction_index: 45,
          analyzed_at: new Date().toISOString()
        }
      };

      return res.status(200).json(analysis);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error('Transaction analysis API error:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export default withRateLimit(handler);
