// pages/api/watchlists/[id].js
import { getSession } from "next-auth/react";
import prisma from "../../../lib/prisma";
import { hasMinimumTier, TierName, getTierErrorMessage } from "../../../lib/tiers";

export default async function handler(req, res) {
  const { id } = req.query;

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

    // Check if user has Enterprise tier
    if (!hasMinimumTier(userTier, TierName.ENTERPRISE)) {
      return res.status(403).json({ error: getTierErrorMessage(TierName.ENTERPRISE) });
    }

    if (req.method === 'DELETE') {
      // TODO: Delete from database
      return res.status(200).json({ success: true, message: "Watchlist deleted" });
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      const { name, description, protocols, chains, alertThreshold } = req.body;

      // TODO: Update in database
      const updatedWatchlist = {
        id,
        userId: user.id,
        name,
        description,
        protocols,
        chains,
        alertThreshold,
        updatedAt: new Date().toISOString()
      };

      return res.status(200).json({ watchlist: updatedWatchlist });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error('Watchlist API error:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
