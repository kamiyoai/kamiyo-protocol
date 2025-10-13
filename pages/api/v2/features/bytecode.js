// pages/api/v2/features/bytecode.js
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
      const { contract_address, chain } = req.body;

      if (!contract_address || !chain) {
        return res.status(400).json({ error: "contract_address and chain required" });
      }

      // TODO: Implement actual bytecode analysis
      // For now, return demo bytecode analysis data
      const analysis = {
        contract_address,
        chain,
        opcodes: [
          { opcode: 'PUSH1', count: 245, percentage: 12.3 },
          { opcode: 'DUP1', count: 189, percentage: 9.5 },
          { opcode: 'SWAP1', count: 156, percentage: 7.8 },
          { opcode: 'CALL', count: 23, percentage: 1.2 },
          { opcode: 'SSTORE', count: 45, percentage: 2.3 },
          { opcode: 'SLOAD', count: 67, percentage: 3.4 }
        ],
        patterns: [
          {
            name: 'External Call Pattern',
            signature: 'CALL_SSTORE_sequence',
            occurrences: 8,
            risk_level: 'medium'
          },
          {
            name: 'Reentrancy Guard',
            signature: 'SLOAD_ISZERO_check',
            occurrences: 3,
            risk_level: 'low'
          },
          {
            name: 'Delegatecall Usage',
            signature: 'DELEGATECALL',
            occurrences: 2,
            risk_level: 'high'
          }
        ],
        similarity_score: 0.92,
        similar_contracts: [
          {
            address: '0x1234...5678',
            similarity: 0.94,
            chain: 'ethereum'
          },
          {
            address: '0xabcd...ef01',
            similarity: 0.89,
            chain: 'ethereum'
          }
        ],
        metadata: {
          bytecode_length: 12456,
          complexity_score: 7.8,
          unique_opcodes: 42,
          analyzed_at: new Date().toISOString()
        }
      };

      return res.status(200).json(analysis);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error('Bytecode analysis API error:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export default withRateLimit(handler);
