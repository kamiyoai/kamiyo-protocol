// pages/api/webhooks/[id].js
import { getServerSession } from 'next-auth/next';
import authOptions from '../auth/[...nextauth]';
import prisma from '../../../lib/prisma';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id } = req.query;

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

  // Verify webhook belongs to user
  const webhook = await prisma.webhook.findFirst({
    where: {
      id,
      userId: user.id
    }
  });

  if (!webhook) {
    return res.status(404).json({ error: 'Webhook not found' });
  }

  if (req.method === 'DELETE') {
    await prisma.webhook.delete({
      where: { id }
    });
    return res.status(204).end();
  }

  if (req.method === 'POST') {
    // Test webhook endpoint
    const { action } = req.body;

    if (action === 'test') {
      const { testWebhook } = await import('../../../lib/webhookNotifier');
      const result = await testWebhook(id);

      if (result.success) {
        return res.status(200).json({ message: result.message });
      } else {
        return res.status(400).json({ error: result.message });
      }
    }

    return res.status(400).json({ error: 'Invalid action' });
  }

  if (req.method === 'PATCH') {
    const { url, name, description, chains, minAmount, status } = req.body;

    const webhook = await prisma.webhook.update({
      where: { id },
      data: {
        ...(url !== undefined && { url }),
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(chains !== undefined && { chains: chains ? JSON.stringify(chains) : null }),
        ...(minAmount !== undefined && { minAmount }),
        ...(status !== undefined && { status })
      }
    });

    return res.status(200).json({ webhook });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
