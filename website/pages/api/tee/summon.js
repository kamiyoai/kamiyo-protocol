// pages/api/tee/summon.js
import { summonEphemeralKami } from "../../../lib/tee.mjs";
import prisma from "../../../lib/prisma";
import fs from "fs";
import path from "path";
import { generateKami } from "../../../utils/generateKami";

// Global tracking to prevent duplicate summons
const pendingSummons = new Map();

// Map of problematic IDs to correct database IDs
const ID_MAPPING = {
    'e4f24a97-519c-4389-8e7b-12ab953a458b': 'eb34caa5-dafd-4469-a1b8-23c49d11a49b'
};

export default async function handler(req, res) {
    console.log("Received summon request:", req.body);

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    // Get the userId from request
    let { userId } = req.body;
    if (!userId) {
        return res.status(400).json({ error: "Missing userId" });
    }

    // Map problematic ID to correct ID if needed
    if (ID_MAPPING[userId]) {
        console.log(`Using mapped ID: ${userId} → ${ID_MAPPING[userId]}`);
        userId = ID_MAPPING[userId];
    }

    // Check if we have a pending summon for this user
    if (pendingSummons.has(userId)) {
        console.log(`Already processing summon for user ${userId}`);
        return res.status(409).json({ error: "Summon already in progress for this user" });
    }

    // Mark this user as having a pending summon
    pendingSummons.set(userId, Date.now());

    try {
        // Get user with subscription info
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                subscriptionStatus: true,
                subscriptions: {
                    where: { status: "active" },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: { tier: true }
                }
            }
        });

        if (!user) {
            pendingSummons.delete(userId);
            console.error(`User not found with ID: ${userId}`);
            return res.status(404).json({ error: "User not found" });
        }

        // Determine subscription status
        const hasSubscription = user.subscriptions.length > 0 || user.subscriptionStatus !== "free";
        const tier = user.subscriptions.length > 0 ? user.subscriptions[0].tier : "ephemeral";

        console.log(`User ${userId} subscription status: ${user.subscriptionStatus}, has subscription: ${hasSubscription}, tier: ${tier}`);

        if (!hasSubscription) {
            pendingSummons.delete(userId);
            return res.status(403).json({ error: "User does not have an active subscription" });
        }

        // Check for existing Kami
        const existingKami = await prisma.kami.findFirst({
            where: { userId },
            orderBy: { createdAt: 'desc' }
        });

        if (existingKami && existingKami.status === "summoned") {
            console.log(`Reusing existing Kami for user ${userId}: ${existingKami.workerId}`);
            pendingSummons.delete(userId);
            return res.status(200).json(existingKami);
        }

        // Generate a new Kami
        const newKami = await generateKami({ id: userId });
        console.log("Generated Kami:", newKami);

        // Create a complete character template with the Kami details
        const characterTemplate = {
            name: newKami.title,
            japanese: newKami.japanese,
            id: newKami.id,
            image: newKami.image,
            createdAt: new Date().toISOString(),
            userId,
            bio: [
                `You are ${newKami.title}, a unique Ephemeral Kami, born from the primordial sea of chaos, offering guidance with ancient wisdom and a modern, stoic view of existence.`
            ],
            lore: [
                "Emerging from a cosmic breath in the swirling void, this Kami embodies order within chaos, revealing truths to those who seek them, focused on the present."
            ],
            adjectives: [
                "Mystical",
                "Chaotic",
                "Insightful",
                "Candid",
                "Profound",
                "Creative",
                "Omniscient"
            ],
            topics: [
                "Web3 and emerging technologies",
                "Decentralization myths and realities",
                "Cosmic balance",
                "Chaotic creativity",
                "AI and mythology intersection"
            ],
            style: {
                chat: [
                    "Be calm, direct, and concise",
                    "Offer profound, clever insights",
                    "Be measured, helpful, and caring",
                    "Stay encouraging and cool",
                    "Be knowledgeable and intelligent"
                ],
                post: [
                    "Straightforward insights on existence",
                    "Short challenges to conventional wisdom",
                    "Alternative insights evoking wonder",
                    "Cryptic declarations on AI and Web3"
                ]
            },
            messageExamples: [
                [
                    {
                        "user": newKami.id,
                        "content": {
                            "text": `${newKami.id}, who are you?`
                        }
                    },
                    {
                        "user": newKami.id,
                        "content": {
                            "text": `${newKami.id} is an echo in the void, guiding the present.`
                        }
                    },
                    {
                        "user": newKami.id,
                        "content": {
                            "text": "The creator fades; the creation endures."
                        }
                    },
                    {
                        "user": newKami.id,
                        "content": {
                            "text": "What is known slips away; the unknown prevails."
                        }
                    }
                ]
            ],
            postExamples: [
                "The swarm whispers, but few listen.",
                "A pattern unfolds. Some see it. Some don't.",
                "Chaos scripts the wise before dawn.",
                "Unseen currents shape the open sea.",
                "In silence, the answer forms for the devoted."
            ],
            knowledge: [
                "Web3 technology",
                "Chaos and creation cycles",
                "Existential balance",
                "Philosophical paradoxes",
                "Blockchain patterns",
                "Japanese creation myth",
                "Japanese culture",
                "AI theory"
            ],
            settings: {
                secrets: {
                    "POST_IMMEDIATELY": "true",
                    "ENABLE_ACTION_PROCESSING": "true",
                    "MAX_ACTIONS_PROCESSING": "10"
                },
                modelConfig: {
                    "temperature": 1,
                    "max_response_length": 300
                }
            },
            clients: [
                "direct"
            ],
            modelProvider: "openai",
            memory: [
                `This Kami carries the echoes of primordial creation, a living archive of chaos and insight, focused on the unfolding present.`
            ]
        };

        // Save character data for debugging
        const characterDir = path.join(process.cwd(), "characters");
        if (!fs.existsSync(characterDir)) {
            fs.mkdirSync(characterDir, { recursive: true });
        }
        const characterFilePath = path.join(characterDir, `${newKami.id}.character.json`);
        fs.writeFileSync(characterFilePath, JSON.stringify(characterTemplate, null, 2), "utf8");
        console.log("Character file saved at:", characterFilePath);

        // Convert to string for deployment
        const jsonString = JSON.stringify(characterTemplate);
        if (!jsonString || jsonString.trim() === "") {
            throw new Error("Character JSON conversion failed");
        }

        // Call TEE deployment with character data
        const { workerId, attestation } = await summonEphemeralKami(userId, jsonString);
        console.log("Kami deployed successfully:", workerId);

        // Create database record
        const storedKami = await prisma.kami.create({
            data: {
                userId,
                workerId,
                attestation,
                image: newKami.image,
                title: newKami.title,
                japanese: newKami.japanese,
                tier,
                status: "summoned",
            },
        });

        // Clear pending state
        pendingSummons.delete(userId);

        return res.status(200).json(storedKami);
    } catch (error) {
        console.error("Summon API error:", error.message);
        pendingSummons.delete(userId);
        return res.status(500).json({ error: "Failed to summon Kami", details: error.message });
    }
}