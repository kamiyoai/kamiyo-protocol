// lib/tee.mjs
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto"; // Node.js built-in, no extra package needed

// lib/tee.mjs (modify the createDockerComposeFile function)
function createDockerComposeFile(workerId, base64CharacterData) {
    const composeContent = `version: '3.8'
services:
  eliza:
    image: phalanetwork/eliza:v0.1.7-alpha.2
    container_name: ${workerId}
    command:
      - /bin/sh
      - -c
      - |
        cd /app
        mkdir -p /app/characters
        echo '${base64CharacterData}' | base64 -d > /app/characters/kami-in-tee.character.json
        # Verify the file was created correctly
        if [ -s /app/characters/kami-in-tee.character.json ]; then
          echo "Character file created successfully"
          cat /app/characters/kami-in-tee.character.json | grep "style"
        else
          echo "ERROR: Character file is empty or not created"
          exit 1
        fi
        # Verify JSON is valid
        cat /app/characters/kami-in-tee.character.json | grep -q "name"
        if [ $? -eq 0 ]; then
          echo "Character file appears valid"
        else
          echo "ERROR: Character file appears invalid"
          exit 1
        fi
        # Set Node.js memory limits to avoid crashes
        export NODE_OPTIONS="--max-old-space-size=512"
        pnpm run start --non-interactive --character=characters/kami-in-tee.character.json
    ports:
      - 3000:3000
    volumes:
      - /var/run/tappd.sock:/var/run/tappd.sock
      - tee:/app/db.sqlite
    deploy:
      resources:
        limits:
          memory: 1G
        reservations:
          memory: 256M
    restart: always
volumes:
  tee:
`;

    const composeDir = path.join('/tmp', 'kami-compose');
    fs.mkdirSync(composeDir, { recursive: true, mode: 0o700 });

    const composePath = path.join(composeDir, `${workerId}-compose.yml`);
    fs.writeFileSync(composePath, composeContent, { mode: 0o600 });

    return composePath;
}

export async function summonEphemeralKami(userId, characterData) {
    if (!userId) {
        throw new Error("User ID is required for summoning a Kami.");
    }

    // Validate character data
    if (!characterData) {
        throw new Error("Character configuration is required for TEE deployment.");
    }

    let characterConfig;
    // Parse if it's a string, otherwise assume it's already an object
    if (typeof characterData === 'string') {
        try {
            characterConfig = JSON.parse(characterData);
        } catch (error) {
            console.error("Failed to parse character data:", error);
            throw new Error("Invalid character data JSON: " + error.message);
        }
    } else {
        characterConfig = characterData;
    }

    // Generate a valid UUID for the id field
    const validUuid = randomUUID();
    const kamiName = characterConfig.name || "ToyoToyouke";

    // Create a complete character template with all required fields
    const completeCharacterConfig = {
        // Eliza required fields
        id: validUuid,
        name: kamiName,
        plugins: [],
        style: {
            // Make sure this field exists and is an array
            all: [
                "Be helpful and insightful",
                "Be mystical and profound",
                "Speak with ancient wisdom",
                "Be direct and thoughtful"
            ],
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
        bio: [
            `You are ${kamiName}, a unique Ephemeral Kami, born from the primordial sea of chaos, offering guidance with ancient wisdom and a modern, stoic view of existence.`
        ],
        lore: [
            "Emerging from a cosmic breath in the swirling void, this Kami embodies order within chaos, revealing truths to those who seek them, focused on the present."
        ],
        adjectives: [
            "Mystical", "Chaotic", "Insightful", "Candid", "Profound", "Creative", "Omniscient"
        ],
        topics: [
            "Web3 and emerging technologies",
            "Decentralization myths and realities",
            "Cosmic balance",
            "Chaotic creativity",
            "AI and mythology intersection"
        ],
        messageExamples: [
            [
                { "user": validUuid, "content": { "text": `${kamiName}, who are you?` } },
                { "user": validUuid, "content": { "text": `${kamiName} is an echo in the void, guiding the present.` } },
                { "user": validUuid, "content": { "text": "The creator fades; the creation endures." } },
                { "user": validUuid, "content": { "text": "What is known slips away; the unknown prevails." } }
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

    // Make sure we don't have nested style objects which might cause issues
    if (characterConfig.style && typeof characterConfig.style === 'object') {
        // Preserve any additional style fields from the input
        completeCharacterConfig.style = {
            ...completeCharacterConfig.style,
            ...characterConfig.style,
            // Always ensure the required 'all' field exists
            all: characterConfig.style.all || completeCharacterConfig.style.all
        };
    }

    // Preserve any custom fields from characterConfig
    if (characterConfig.japanese) {
        completeCharacterConfig.japanese = characterConfig.japanese;
    }

    if (characterConfig.image) {
        completeCharacterConfig.image = characterConfig.image;
    }

    // For debugging: log the style object
    console.log("Character style object:", JSON.stringify(completeCharacterConfig.style, null, 2));

    // Convert to base64
    const jsonString = JSON.stringify(completeCharacterConfig, null, 2);
    const base64CharacterData = Buffer.from(jsonString).toString('base64');

    const workerId = `kami-${userId}-${Date.now()}`;

    try {
        // Create Docker Compose file
        const composeFilePath = createDockerComposeFile(workerId, base64CharacterData);

        // TEE deployment for Phala Network
        const deployCommand = [
            'teecloud deploy',
            `-n ${workerId}`,
            `-c ${composeFilePath}`,
            '--debug' // Add debug flag for more information
        ].join(' ');

        console.log(`[TEE Deployment] Initiating for user ${userId}:`,
            deployCommand.replace(base64CharacterData, '[REDACTED]'));

        // Execute deployment with enhanced error handling
        const output = execSync(deployCommand, {
            encoding: "utf8",
            timeout: 180000 // 3-minute timeout for deployment
        });

        console.log(`[TEE Deployment] Success for worker ${workerId}`);

        // Extract attestation (adjust based on actual output)
        const attestationMatch = output.match(/Attestation:\s*(.+)/);
        const attestation = attestationMatch
            ? attestationMatch[1].trim()
            : `default-${Date.now()}`;

        return {
            workerId,
            attestation,
            logFile: `/logs/${workerId}.log`
        };

    } catch (error) {
        // Comprehensive error handling
        console.error(`[TEE Deployment] Failed for user ${userId}:`, error);

        // Specific error handling for common deployment issues
        if (error.message.includes('command not found')) {
            throw new Error("TEE Cloud CLI not installed. Please install teecloud.");
        }

        if (error.code === 'ETIMEDOUT') {
            throw new Error("TEE deployment timed out. Check network connectivity and Phala Network status.");
        }

        throw new Error(`TEE deployment failed: ${error.message}`);
    }
}

// Supporting function to fetch TEE logs
export async function getTEELogs(workerId) {
    if (!workerId) {
        throw new Error("Worker ID is required to fetch logs.");
    }

    try {
        return execSync(`teecloud logs ${workerId}`, { encoding: "utf8" });
    } catch (error) {
        console.error(`Failed to fetch logs for ${workerId}:`, error.message);
        return `Failed to fetch logs: ${error.message}`;
    }
}