// pages/api/kami/latest.js
import { getSession } from "next-auth/react";
import prisma from "../../../lib/prisma";

export default async function handler(req, res) {
    const session = await getSession({ req });
    if (!session?.user?.id) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    try {
        const latestKami = await prisma.kami.findFirst({
            where: { userId: session.user.id },
            orderBy: { createdAt: 'desc' },
        });
        res.status(200).json(latestKami || null);
    } catch (error) {
        console.error("Fetch kami error:", error);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
}