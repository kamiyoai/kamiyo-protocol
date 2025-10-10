// pages/api/analysis/patterns.js
import { getSession } from "next-auth/react";
import prisma from "../../../lib/prisma";

export default async function handler(req, res) {
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

    // Check if user has Team+ tier
    const allowedTiers = ['team', 'enterprise'];
    if (!subscription || !allowedTiers.includes(subscription.tier?.toLowerCase())) {
      return res.status(403).json({ error: "Team tier or higher required" });
    }

    if (req.method === 'GET') {
      const { timeRange, minClusterSize, similarityThreshold } = req.query;

      // TODO: Implement actual ML clustering analysis
      // For now, return demo cluster data
      const clusters = [
        {
          id: 'cluster-1',
          name: 'Reentrancy Attacks',
          exploitCount: 24,
          totalLoss: 45000000,
          avgSimilarity: 0.89,
          chains: ['Ethereum', 'BSC', 'Arbitrum'],
          timeRange: '90 days',
          commonCharacteristics: [
            'External call before state update',
            'Missing nonReentrant modifier',
            'Unprotected withdrawal function',
            'State changes after external calls'
          ],
          recentExploits: [
            {
              id: 'exp-1',
              protocol: 'DeFi Protocol A',
              chain: 'Ethereum',
              date: '2024-03-15',
              loss: 2500000,
              similarity: 0.94
            },
            {
              id: 'exp-2',
              protocol: 'Lending Platform B',
              chain: 'BSC',
              date: '2024-03-10',
              loss: 1800000,
              similarity: 0.91
            },
            {
              id: 'exp-3',
              protocol: 'Staking Pool C',
              chain: 'Arbitrum',
              date: '2024-03-05',
              loss: 950000,
              similarity: 0.87
            }
          ]
        },
        {
          id: 'cluster-2',
          name: 'Flash Loan Exploits',
          exploitCount: 18,
          totalLoss: 38000000,
          avgSimilarity: 0.85,
          chains: ['Ethereum', 'Polygon', 'Avalanche'],
          timeRange: '90 days',
          commonCharacteristics: [
            'Price oracle manipulation',
            'Single block attack execution',
            'Use of flash loan protocols (Aave, Balancer)',
            'Arbitrage exploitation'
          ],
          recentExploits: [
            {
              id: 'exp-4',
              protocol: 'DEX Exchange D',
              chain: 'Ethereum',
              date: '2024-03-18',
              loss: 5200000,
              similarity: 0.92
            },
            {
              id: 'exp-5',
              protocol: 'AMM Platform E',
              chain: 'Polygon',
              date: '2024-03-12',
              loss: 3100000,
              similarity: 0.88
            }
          ]
        },
        {
          id: 'cluster-3',
          name: 'Access Control Failures',
          exploitCount: 15,
          totalLoss: 22000000,
          avgSimilarity: 0.82,
          chains: ['Ethereum', 'BSC', 'Optimism'],
          timeRange: '90 days',
          commonCharacteristics: [
            'Missing onlyOwner modifiers',
            'Unprotected initialization functions',
            'Improper role-based access control',
            'Public functions that should be internal'
          ],
          recentExploits: [
            {
              id: 'exp-6',
              protocol: 'Bridge Protocol F',
              chain: 'Ethereum',
              date: '2024-03-08',
              loss: 8500000,
              similarity: 0.86
            },
            {
              id: 'exp-7',
              protocol: 'Token Contract G',
              chain: 'BSC',
              date: '2024-02-28',
              loss: 2800000,
              similarity: 0.81
            }
          ]
        },
        {
          id: 'cluster-4',
          name: 'Integer Overflow/Underflow',
          exploitCount: 12,
          totalLoss: 15000000,
          avgSimilarity: 0.78,
          chains: ['Ethereum', 'BSC'],
          timeRange: '90 days',
          commonCharacteristics: [
            'Unchecked arithmetic operations',
            'Missing SafeMath library usage',
            'Solidity version < 0.8.0',
            'Balance manipulation via overflow'
          ],
          recentExploits: [
            {
              id: 'exp-8',
              protocol: 'Legacy Token H',
              chain: 'Ethereum',
              date: '2024-03-01',
              loss: 4200000,
              similarity: 0.83
            },
            {
              id: 'exp-9',
              protocol: 'Old DeFi Protocol I',
              chain: 'BSC',
              date: '2024-02-20',
              loss: 1900000,
              similarity: 0.75
            }
          ]
        }
      ];

      // Filter by parameters if provided
      let filteredClusters = clusters;
      if (minClusterSize) {
        filteredClusters = filteredClusters.filter(c => c.exploitCount >= parseInt(minClusterSize));
      }
      if (similarityThreshold) {
        filteredClusters = filteredClusters.filter(c => c.avgSimilarity >= parseFloat(similarityThreshold));
      }

      return res.status(200).json({
        clusters: filteredClusters,
        meta: {
          timeRange: timeRange || '90d',
          totalClusters: filteredClusters.length,
          totalExploits: filteredClusters.reduce((sum, c) => sum + c.exploitCount, 0),
          totalLoss: filteredClusters.reduce((sum, c) => sum + c.totalLoss, 0)
        }
      });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error('Pattern clustering API error:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
