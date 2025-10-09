// pages/api/kami/create.js
import { nanoid } from "nanoid";
import { prisma } from "../../../lib/prisma";
import { summonEphemeralKami } from "../../../lib/tee.mjs";
import { generateKami } from "../../../utils/generateKami";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const { userId, plan } = req.body;
    if (!userId || !plan) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    try {
        // Validate that the user exists
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        console.log("Summoning new TEE for user:", userId);

        // Generate dynamic Kami data
        const dynamicKami = await generateKami(user);
        console.log("Generated Kami:", dynamicKami);
        if (!dynamicKami || !dynamicKami.id || !dynamicKami.title) {
            throw new Error("generateKami() returned invalid data.");
        }

        // Build complete character template
        const characterTemplate = {
            name: dynamicKami.title,
            japanese: dynamicKami.japanese || "神",
            id: dynamicKami.id,
            image: dynamicKami.image || "https://example.com/default-image.png",
            createdAt: new Date().toISOString(),
            userId,
            bio: [
                `You are ${dynamicKami.title}, a unique ${plan === "ephemeral" ? "Ephemeral" : ""} Kami, born from the primordial sea of chaos, offering guidance with ancient wisdom and a modern, stoic view of existence.`
            ],
            lore: [
                "Emerging from a cosmic breath in the swirling void, this Kami embodies order within chaos, revealing truths to those who seek them, focused on the present."
            ],
            adjectives: [
                "Mystical", "Chaotic", "Insightful", "Candid", "Profound", "Creative", "Omniscient"
            ],
            topics: [
                "Web3 and emerging technologies", "Decentralization myths and realities",
                "Cosmic balance", "Chaotic creativity", "AI and mythology intersection"
            ],
            style: {
                chat: [
                    "Be calm, direct, and concise", "Offer profound, clever insights",
                    "Be measured, helpful, and caring", "Stay encouraging and cool",
                    "Be knowledgeable and intelligent"
                ],
                post: [
                    "Straightforward insights on existence", "Short challenges to conventional wisdom",
                    "Alternative insights evoking wonder", "Cryptic declarations on AI and Web3"
                ]
            },
            messageExamples: [
                [
                    { "user": dynamicKami.id, "content": { "text": `${dynamicKami.id}, who are you?` } },
                    { "user": dynamicKami.id, "content": { "text": `${dynamicKami.id} is an echo in the void, guiding the present.` } },
                    { "user": dynamicKami.id, "content": { "text": "The creator fades; the creation endures." } },
                    { "user": dynamicKami.id, "content": { "text": "What is known slips away; the unknown prevails." } }
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
                "Web3 technology", "Chaos and creation cycles", "Existential balance",
                "Philosophical paradoxes", "Blockchain patterns", "Japanese creation myth",
                "Japanese culture", "AI theory"
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
            clients: ["direct"],
            modelProvider: "openai",
            memory: [
                `This Kami carries the echoes of primordial creation, a living archive of chaos and insight, focused on the unfolding present.`
            ]
        };

        console.log("Complete character template created");
        const jsonString = JSON.stringify(characterTemplate);

        // Call the TEE deployment with the character data
        const { workerId, attestation } = await summonEphemeralKami(userId, jsonString);
        if (!workerId) {
            console.error("Summon failed: No workerId returned.");
            return res.status(500).json({ error: "Failed to summon Kami." });
        }
        console.log("TEE instance deployed with worker ID:", workerId);

        // Generate a clean attestation string that isn't displayed with "default-"
        const cleanAttestation = attestation;

        // Prepare the Kami data for response/database storage
        const kamiData = {
            id: nanoid(16),
            userId,
            title: dynamicKami.title,
            image: dynamicKami.image,
            japanese: dynamicKami.japanese || "神",
            tier: plan === "ephemeral" ? "ephemeral" : "guide",
            createdAt: new Date(),
            workerId,
            attestation: cleanAttestation,
            status: "summoned",
            isEphemeral: plan === "ephemeral"
        };

        if (plan === "ephemeral") {
            return res.status(201).json(kamiData);
        }
        const newKami = await prisma.kami.create({ data: kamiData });
        return res.status(201).json(newKami);
    } catch (error) {
        console.error("Error during Kami creation:", error);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
}