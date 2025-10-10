// pages/api/watchlists/index.js
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

    // Check if user has Enterprise tier (required for watchlists)
    if (!hasMinimumTier(userTier, TierName.ENTERPRISE)) {
      return res.status(403).json({ error: getTierErrorMessage(TierName.ENTERPRISE) });
    }

    if (req.method === 'GET') {
      // Return demo watchlists for now
      // TODO: Replace with actual database queries
      const watchlists = [
        {
          id: '1',
          userId: user.id,
          name: 'DeFi Protocols',
          description: 'Major DeFi protocols on Ethereum',
          protocols: ['Uniswap', 'Aave', 'Compound', 'MakerDAO'],
          chains: ['Ethereum'],
          alertThreshold: 'all',
          createdAt: new Date('2024-01-15').toISOString(),
          alertCount: 12
        },
        {
          id: '2',
          userId: user.id,
          name: 'Cross-chain Bridges',
          description: 'Monitoring bridge vulnerabilities',
          protocols: ['Wormhole', 'LayerZero', 'Multichain'],
          chains: ['Ethereum', 'BSC', 'Polygon'],
          alertThreshold: 'critical',
          createdAt: new Date('2024-02-01').toISOString(),
          alertCount: 5
        }
      ];

      return res.status(200).json({ watchlists });
    }

    if (req.method === 'POST') {
      const { name, description, protocols, chains, alertThreshold } = req.body;

      if (!name || !description) {
        return res.status(400).json({ error: "Name and description required" });
      }

      // TODO: Create watchlist in database
      const newWatchlist = {
        id: Date.now().toString(),
        userId: user.id,
        name,
        description,
        protocols: protocols || [],
        chains: chains || [],
        alertThreshold: alertThreshold || 'all',
        createdAt: new Date().toISOString(),
        alertCount: 0
      };

      return res.status(201).json({ watchlist: newWatchlist });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error('Watchlists API error:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
