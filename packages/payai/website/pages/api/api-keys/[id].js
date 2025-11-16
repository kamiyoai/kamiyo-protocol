// pages/api/api-keys/[id].js
import { getSession } from "next-auth/react";
import prisma from "../../../lib/prisma";

export default async function handler(req, res) {
  try {
    const { id } = req.query;

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

    // DELETE - Revoke API key
    if (req.method === 'DELETE') {
      const apiKey = await prisma.apiKey.findFirst({
        where: { id, userId: user.id },
      });

      if (!apiKey) {
        return res.status(404).json({ error: "API key not found" });
      }

      await prisma.apiKey.update({
        where: { id },
        data: { status: 'revoked' },
      });

      return res.status(200).json({ message: "API key revoked successfully" });
    }

    // PATCH - Update API key (e.g., rename)
    if (req.method === 'PATCH') {
      const { name } = req.body;

      const apiKey = await prisma.apiKey.findFirst({
        where: { id, userId: user.id },
      });

      if (!apiKey) {
        return res.status(404).json({ error: "API key not found" });
      }

      const updated = await prisma.apiKey.update({
        where: { id },
        data: { name },
      });

      return res.status(200).json({
        id: updated.id,
        name: updated.name,
        message: "API key updated successfully",
      });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error('API key management error:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
