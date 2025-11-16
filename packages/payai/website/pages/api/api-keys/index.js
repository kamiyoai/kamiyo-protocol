// pages/api/api-keys/index.js
import { getSession } from "next-auth/react";
import prisma from "../../../lib/prisma";
import crypto from "crypto";

export default async function handler(req, res) {
  try {
    // Check authentication
    const session = await getSession({ req });
    if (!session?.user?.email) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // GET - List all API keys for user
    if (req.method === 'GET') {
      const apiKeys = await prisma.apiKey.findMany({
        where: { userId: user.id },
        select: {
          id: true,
          name: true,
          key: true,
          lastUsed: true,
          createdAt: true,
          expiresAt: true,
          status: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      // Mask the keys for security (show only first 8 and last 4 characters)
      const maskedKeys = apiKeys.map(k => ({
        ...k,
        key: `${k.key.substring(0, 8)}...${k.key.substring(k.key.length - 4)}`,
        keyPreview: k.key.substring(0, 12),
      }));

      return res.status(200).json({ apiKeys: maskedKeys });
    }

    // POST - Create new API key
    if (req.method === 'POST') {
      const { name, expiresInDays } = req.body;

      // Generate secure random API key
      const apiKey = `kmy_${crypto.randomBytes(32).toString('hex')}`;

      // Calculate expiration date if specified
      let expiresAt = null;
      if (expiresInDays && expiresInDays > 0) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + parseInt(expiresInDays));
      }

      // Create API key
      const newApiKey = await prisma.apiKey.create({
        data: {
          userId: user.id,
          key: apiKey,
          name: name || 'API Key',
          expiresAt,
          status: 'active',
        },
      });

      return res.status(201).json({
        id: newApiKey.id,
        key: apiKey, // Return full key only once at creation
        name: newApiKey.name,
        createdAt: newApiKey.createdAt,
        expiresAt: newApiKey.expiresAt,
        message: 'API key created successfully. Save this key - it will not be shown again.',
      });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error('API keys endpoint error:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
