// pages/api/webhooks/index.js
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
      // TODO: Fetch webhooks from database
      const webhooks = [
        {
          id: 'wh-1',
          userId: user.id,
          name: 'Slack Notifications',
          url: 'https://hooks.slack.com/services/...',
          events: ['exploit.created', 'exploit.high_severity'],
          chains: ['Ethereum', 'BSC'],
          status: 'active',
          secret: 'whsec_...', // Masked in response
          createdAt: '2024-02-15',
          lastTriggered: '2024-03-20T14:30:00Z',
          deliveryRate: 98.5,
          totalDeliveries: 450,
          failedDeliveries: 7
        },
        {
          id: 'wh-2',
          userId: user.id,
          name: 'Internal API',
          url: 'https://api.example.com/webhooks/kamiyo',
          events: ['exploit.created', 'anomaly.detected'],
          chains: ['all'],
          status: 'active',
          secret: 'whsec_...',
          createdAt: '2024-01-10',
          lastTriggered: '2024-03-20T12:15:00Z',
          deliveryRate: 99.8,
          totalDeliveries: 1250,
          failedDeliveries: 3
        }
      ];

      return res.status(200).json({ webhooks });
    }

    if (req.method === 'POST') {
      const { name, url, events, chains, secret } = req.body;

      if (!name || !url || !events || events.length === 0) {
        return res.status(400).json({ error: "name, url, and events required" });
      }

      // Validate URL format
      try {
        new URL(url);
      } catch (e) {
        return res.status(400).json({ error: "Invalid URL format" });
      }

      // Check webhook limit based on tier
      const webhookLimit = subscription.tier?.toLowerCase() === 'enterprise' ? 50 : 5;
      // TODO: Check current webhook count from database
      const currentWebhookCount = 2; // Demo value

      if (currentWebhookCount >= webhookLimit) {
        return res.status(403).json({
          error: `Webhook limit reached. Your ${subscription.tier} tier allows ${webhookLimit} webhooks.`
        });
      }

      // TODO: Create webhook in database
      const newWebhook = {
        id: `wh-${Date.now()}`,
        userId: user.id,
        name,
        url,
        events,
        chains: chains || ['all'],
        status: 'active',
        secret: secret || `whsec_${Math.random().toString(36).substring(2, 15)}`,
        createdAt: new Date().toISOString(),
        lastTriggered: null,
        deliveryRate: 100,
        totalDeliveries: 0,
        failedDeliveries: 0
      };

      return res.status(201).json({ webhook: newWebhook });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error('Webhooks API error:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
