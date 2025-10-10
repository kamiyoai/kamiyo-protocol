// pages/api/webhooks/index.js
import { getServerSession } from 'next-auth/next';
import authOptions from '../auth/[...nextauth]';
import prisma from '../../../lib/prisma';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

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
  if (!['team', 'enterprise'].includes(tier)) {
    return res.status(403).json({ error: 'Team or Enterprise tier required' });
  }

  const webhookLimit = tier === 'team' ? 5 : 50;

  if (req.method === 'GET') {
    const webhooks = await prisma.webhook.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' }
    });
    return res.status(200).json({ webhooks, limit: webhookLimit });
  }

  if (req.method === 'POST') {
    const { url, name, description, chains, minAmount } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL required' });
    }

    const currentCount = await prisma.webhook.count({
      where: { userId: user.id }
    });

    if (currentCount >= webhookLimit) {
      return res.status(403).json({ error: `Limit reached (${webhookLimit})` });
    }

    const webhook = await prisma.webhook.create({
      data: {
        userId: user.id,
        url,
        name: name || null,
        description: description || null,
        chains: chains ? JSON.stringify(chains) : null,
        minAmount: minAmount || null,
        status: 'active'
      }
    });

    return res.status(201).json({ webhook });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
