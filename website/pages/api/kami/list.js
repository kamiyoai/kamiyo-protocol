// pages/api/kami/list.js
import { getSession } from "next-auth/react";
import prisma from "../../../lib/prisma";

export default async function handler(req, res) {
    const session = await getSession({ req });
    if (!session?.user?.id) return res.status(401).json({ error: "Unauthorized" });

    try {
        const kamiList = await prisma.kami.findMany({ where: { userId: session.user.id } });
        res.json(kamiList);
    } catch (error) {
        console.error("Kami list error:", error.message, error.stack); // Enhanced logging
        res.status(500).json({ error: "Internal Server Error" });
    }
}