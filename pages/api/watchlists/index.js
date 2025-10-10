// pages/api/watchlists/index.js
import { getServerSession } from 'next-auth/next';
import authOptions from '../auth/[...nextauth]';
import prisma from '../../../lib/prisma';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);

  if (!session?.user?.email) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Get user and verify Enterprise tier
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: {
      subscriptions: {
        where: { status: 'active' },
        orderBy: { createdAt: 'desc' },
        take: 1
      }
    }
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const tier = user.subscriptions[0]?.tier || 'free';
  if (tier !== 'enterprise') {
    return res.status(403).json({ error: 'Enterprise tier required for watchlists' });
  }

  if (req.method === 'GET') {
    // List all watchlists for user
    const watchlists = await prisma.watchlist.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({ watchlists });
  }

  if (req.method === 'POST') {
    // Create new watchlist
    const { protocol, chain, alertOnNew, notes } = req.body;

    if (!protocol) {
      return res.status(400).json({ error: 'Protocol is required' });
    }

    try {
      const watchlist = await prisma.watchlist.create({
        data: {
          userId: user.id,
          protocol,
          chain: chain || null,
          alertOnNew: alertOnNew !== undefined ? alertOnNew : true,
          notes: notes || null
        }
      });

      return res.status(201).json({ watchlist });
    } catch (error) {
      if (error.code === 'P2002') {
        // Unique constraint violation
        return res.status(409).json({ error: 'Watchlist for this protocol+chain already exists' });
      }
      throw error;
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
