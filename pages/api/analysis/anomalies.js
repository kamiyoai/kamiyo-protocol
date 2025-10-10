// pages/api/analysis/anomalies.js
import { getSession } from "next-auth/react";
import prisma from "../../../lib/prisma";
import { hasMinimumTier, TierName, getTierErrorMessage } from "../../../lib/tiers";

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

    const userTier = subscription?.tier || TierName.FREE;

    // Check if user has Enterprise tier (anomaly detection requires Enterprise)
    if (!hasMinimumTier(userTier, TierName.ENTERPRISE)) {
      return res.status(403).json({ error: getTierErrorMessage(TierName.ENTERPRISE) });
    }

    if (req.method === 'GET') {
      const { timeRange } = req.query;

      // TODO: Implement actual anomaly detection algorithms
      // For now, return demo anomaly data
      const anomalies = [
        {
          id: 'anom-1',
          type: 'unusual_frequency',
          severity: 'high',
          title: 'Spike in Reentrancy Attacks',
          description: '300% increase in reentrancy-based exploits detected in the last 48 hours',
          affectedChains: ['Ethereum', 'Arbitrum'],
          detectedAt: '2024-03-20T14:30:00Z',
          metrics: { baseline: 3, current: 12, deviation: 3.2 }
        },
        {
          id: 'anom-2',
          type: 'new_pattern',
          severity: 'critical',
          title: 'Novel Attack Vector Detected',
          description: 'Previously unseen exploit pattern targeting bridge contracts',
          affectedChains: ['Polygon', 'BSC'],
          detectedAt: '2024-03-20T10:15:00Z',
          metrics: { confidence: 0.94, exploitCount: 5 }
        },
        {
          id: 'anom-3',
          type: 'unusual_loss',
          severity: 'high',
          title: 'Abnormally High Loss Amount',
          description: 'Single exploit with $45M loss detected - 10x above 90-day average',
          affectedChains: ['Ethereum'],
          detectedAt: '2024-03-19T22:45:00Z',
          metrics: { amount: 45000000, avgLoss: 4200000, deviation: 9.7 }
        },
        {
          id: 'anom-4',
          type: 'coordinated_attack',
          severity: 'critical',
          title: 'Coordinated Multi-Chain Attack',
          description: 'Similar exploits executed simultaneously across 4 chains within 10 minutes',
          affectedChains: ['Ethereum', 'BSC', 'Polygon', 'Arbitrum'],
          detectedAt: '2024-03-19T18:20:00Z',
          metrics: { chains: 4, timeWindow: 600, totalLoss: 12000000 }
        },
        {
          id: 'anom-5',
          type: 'unusual_frequency',
          severity: 'medium',
          title: 'Flash Loan Attack Surge',
          description: '150% increase in flash loan exploits on BSC in the last 72 hours',
          affectedChains: ['BSC'],
          detectedAt: '2024-03-18T16:20:00Z',
          metrics: { baseline: 6, current: 15, deviation: 2.5 }
        },
        {
          id: 'anom-6',
          type: 'new_pattern',
          severity: 'high',
          title: 'Emerging Proxy Contract Vulnerability',
          description: 'New exploit pattern targeting upgradeable proxy implementations',
          affectedChains: ['Ethereum', 'Polygon', 'Optimism'],
          detectedAt: '2024-03-17T09:45:00Z',
          metrics: { confidence: 0.88, exploitCount: 7 }
        },
        {
          id: 'anom-7',
          type: 'coordinated_attack',
          severity: 'critical',
          title: 'Synchronized Cross-Chain Bridge Attacks',
          description: 'Identical attack signature detected on 5 different bridge protocols within 2 hours',
          affectedChains: ['Ethereum', 'BSC', 'Polygon', 'Arbitrum', 'Optimism'],
          detectedAt: '2024-03-16T21:30:00Z',
          metrics: { chains: 5, timeWindow: 7200, totalLoss: 28000000 }
        },
        {
          id: 'anom-8',
          type: 'unusual_loss',
          severity: 'critical',
          title: 'Extreme Loss Event',
          description: 'Record-breaking $120M exploit detected - 25x above historical average',
          affectedChains: ['Ethereum'],
          detectedAt: '2024-03-15T03:15:00Z',
          metrics: { amount: 120000000, avgLoss: 4800000, deviation: 24.1 }
        }
      ];

      // Filter by time range if needed
      let filteredAnomalies = anomalies;
      if (timeRange === '24h') {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        filteredAnomalies = anomalies.filter(a => new Date(a.detectedAt) >= oneDayAgo);
      } else if (timeRange === '7d') {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        filteredAnomalies = anomalies.filter(a => new Date(a.detectedAt) >= sevenDaysAgo);
      }

      return res.status(200).json({
        anomalies: filteredAnomalies,
        meta: {
          timeRange: timeRange || '30d',
          totalAnomalies: filteredAnomalies.length,
          criticalCount: filteredAnomalies.filter(a => a.severity === 'critical').length,
          highCount: filteredAnomalies.filter(a => a.severity === 'high').length,
          mediumCount: filteredAnomalies.filter(a => a.severity === 'medium').length
        }
      });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error('Anomaly detection API error:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
