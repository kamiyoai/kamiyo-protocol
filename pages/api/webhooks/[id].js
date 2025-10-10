// pages/api/webhooks/[id].js
import { getSession } from "next-auth/react";
import prisma from "../../../lib/prisma";

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

    // Check if user has Team+ tier
    const allowedTiers = ['team', 'enterprise'];
    if (!subscription || !allowedTiers.includes(subscription.tier?.toLowerCase())) {
      return res.status(403).json({ error: "Team tier or higher required" });
    }

    if (req.method === 'DELETE') {
      // TODO: Delete webhook from database
      // Verify webhook belongs to user before deleting
      return res.status(200).json({ success: true, message: "Webhook deleted" });
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      const { name, url, events, chains, status } = req.body;

      // Validate URL if provided
      if (url) {
        try {
          new URL(url);
        } catch (e) {
          return res.status(400).json({ error: "Invalid URL format" });
        }
      }

      // TODO: Update webhook in database
      // Verify webhook belongs to user before updating
      const updatedWebhook = {
        id,
        userId: user.id,
        name,
        url,
        events,
        chains,
        status,
        updatedAt: new Date().toISOString()
      };

      return res.status(200).json({ webhook: updatedWebhook });
    }

    if (req.method === 'POST' && req.query.action === 'test') {
      // Test webhook by sending a sample payload
      // TODO: Send actual test payload to webhook URL
      const testPayload = {
        event: 'webhook.test',
        timestamp: new Date().toISOString(),
        data: {
          message: 'This is a test webhook from KAMIYO',
          webhook_id: id
        }
      };

      return res.status(200).json({
        success: true,
        message: "Test payload sent",
        payload: testPayload
      });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error('Webhook API error:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
