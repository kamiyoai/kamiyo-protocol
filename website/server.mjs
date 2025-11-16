// server.mjs
import express from 'express';
import next from 'next';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { summonEphemeralKami } from './lib/tee.mjs';
import axios from "axios";

const dev = process.env.NODE_ENV !== 'production';
console.log('[Next.js] Development mode:', dev);
console.log('[Next.js] Preparing Next.js app...');
const app = next({ dev });
const handle = app.getRequestHandler();

// Configuration
const MAIN_LOGS_URL = "https://b39afb7ea03324a0ddd5e457364be623728b7819-8090.dstack-prod5.phala.network/logs/eliza?text&bare&timestamps&follow&tail=400";
const USER_KAMI_LOGS_BASE_URL = "https://b39afb7ea03324a0ddd5e457364be623728b7819-8090.dstack-prod5.phala.network/logs";

app.prepare().then(() => {
    console.log('[Next.js] App prepared successfully!');
    const server = express();
    const httpServer = createServer(server);

    // Handle Next.js HMR separately - important for development mode
    server.use('/_next/webpack-hmr', (req, res) => {
        // Simply pass through HMR requests to Next.js
        return handle(req, res);
    });

    // Setup Socket.IO with proper CORS and options
    const io = new Server(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
            allowedHeaders: ["*"],
            credentials: true
        },
        transports: ["websocket", "polling"],
        path: "/api/socket", // Change this to match the client's connection path
        allowEIO3: true,
        maxHttpBufferSize: 1e8
    });

    // Define the streamUserKamiLogs function that handles log streaming
    const streamUserKamiLogs = async (socket, workerId) => {
        if (!workerId) {
            socket.emit("error", "workerId is required");
            return;
        }

        console.log(`[User Kami Logs] Starting log stream from TEE for worker: ${workerId}`);

        // For development/simulation mode
        if (process.env.NODE_ENV === 'development' || process.env.TEE_SIMULATION === 'true') {
            // Generate simulated logs specific to this Kami instance
            const simulatedLogData = [
                `Initializing secure TEE environment for ${workerId}...`,
                `Loading Kami character data for instance ${workerId.split('-')[2]}...`,
                "Validating character definition...",
                "Setting up secure communication channels...",
                "Establishing memory protected regions...",
                "Loading language models...",
                "TEE attestation verified successfully",
                "Character data loaded successfully",
                "Kami is active and listening for user connections",
                "Secure channel established with client",
                "Ready to receive messages"
            ];

            // Send initial logs with delay to mimic streaming
            let index = 0;
            const sendLogInterval = setInterval(() => {
                if (index < simulatedLogData.length) {
                    const logData = simulatedLogData[index];
                    const timestamp = new Date().toISOString();
                    console.log(`[User Kami Logs] Sending simulated log for ${workerId}: ${logData}`);
                    socket.emit("logs", {
                        source: "userKami",
                        workerId,
                        data: `[${timestamp}] ${logData}`
                    });
                    index++;
                } else {
                    clearInterval(sendLogInterval);

                    // Start sending periodic "heartbeat" logs specific to this Kami
                    const heartbeatInterval = setInterval(() => {
                        const actions = [
                            `Processing user request for Kami ${workerId.split('-')[2]}...`,
                            "Checking security attestation...",
                            "Memory integrity verified",
                            "Secure channel maintained",
                            "TEE attestation refreshed",
                            "Character state updated"
                        ];
                        const randomAction = actions[Math.floor(Math.random() * actions.length)];
                        const timestamp = new Date().toISOString();
                        socket.emit("logs", {
                            source: "userKami",
                            workerId,
                            data: `[${timestamp}] ${randomAction}`
                        });
                    }, 8000); // Send a new log every 8 seconds

                    // Store the interval ID in socket data so we can clear it on disconnect
                    socket.data = socket.data || {};
                    socket.data.heartbeatInterval = heartbeatInterval;

                    // Clear the heartbeat when the socket disconnects
                    socket.once('disconnect', () => {
                        clearInterval(heartbeatInterval);
                    });
                }
            }, 800);

            return;
        }

        // Production mode with real TEE logs - use the specific workerId
        try {
            const USER_KAMI_LOGS_URL = `${USER_KAMI_LOGS_BASE_URL}/${workerId}?text&bare&timestamps&follow&tail=400`;
            console.log(`[User Kami Logs] Fetching logs for worker: ${workerId} from URL: ${USER_KAMI_LOGS_URL}`);

            const response = await axios.get(USER_KAMI_LOGS_URL, {
                responseType: 'stream',
                timeout: 30000 // 30 second timeout
            });

            response.data.on('data', (chunk) => {
                const logData = chunk.toString().trim();
                if (logData) {
                    // Only log the first part of potentially long log entries
                    console.log(`[User Kami Logs] Received (${workerId}):`,
                        logData.substring(0, 100) + (logData.length > 100 ? '...' : ''));
                    socket.emit("logs", { source: "userKami", workerId, data: logData });
                }
            });

            response.data.on('error', (error) => {
                console.error(`[User Kami Logs] Error for ${workerId}:`, error.message);
                socket.emit("logs", {
                    source: "userKami",
                    workerId,
                    error: error.message,
                    data: `Error receiving logs: ${error.message}`
                });
            });

            socket.once('disconnect', () => {
                try {
                    response.data.destroy(); // Close the stream when socket disconnects
                } catch (e) {
                    console.warn(`[User Kami Logs] Error destroying stream:`, e.message);
                }
            });

        } catch (error) {
            console.error(`[User Kami Logs] Fetch error for ${workerId}:`, error.message);
            socket.emit("logs", {
                source: "userKami",
                workerId,
                error: error.message,
                data: `Failed to connect to log stream: ${error.message}`
            });

            // Fall back to simulated logs after failure
            if (process.env.NODE_ENV === 'development') {
                console.log(`[User Kami Logs] Falling back to simulated logs for ${workerId}`);
                socket.emit("logs", {
                    source: "userKami",
                    workerId,
                    data: `[${new Date().toISOString()}] Falling back to simulated logs after connection failure`
                });
                // Call this function again which will use the simulation path
                process.env.TEE_SIMULATION = 'true';
                setTimeout(() => streamUserKamiLogs(socket, workerId), 1000);
            }
        }
    };

    // Function to stream main agent logs
    const streamMainAgentLogs = async (socket) => {
        try {
            console.log(`[Main Agent Logs] Starting log stream from TEE for main agent`);
            const response = await axios.get(MAIN_LOGS_URL, {
                responseType: 'stream',
                timeout: 30000 // 30 second timeout
            });

            response.data.on('data', (chunk) => {
                const logData = chunk.toString().trim();
                if (logData) {
                    console.log("[Main Agent Logs] Received:",
                        logData.substring(0, 100) + (logData.length > 100 ? '...' : ''));
                    socket.emit("logs", { source: "mainAgent", data: logData });
                }
            });

            response.data.on('error', (error) => {
                console.error("[Main Agent Logs] Error:", error.message);
                socket.emit("logs", {
                    source: "mainAgent",
                    error: error.message,
                    data: `Error receiving logs: ${error.message}`
                });
            });

            socket.once('disconnect', () => {
                try {
                    response.data.destroy(); // Close the stream when socket disconnects
                } catch (e) {
                    console.warn(`[Main Agent Logs] Error destroying stream:`, e.message);
                }
            });

        } catch (error) {
            console.error("[Main Agent Logs] Fetch error:", error.message);
            socket.emit("logs", {
                source: "mainAgent",
                error: error.message,
                data: `Failed to connect to log stream: ${error.message}`
            });
        }
    };

    // Handle WebSocket errors at the server level
    io.on("connect_error", (err) => {
        console.log(`[WebSocket] Connection error: ${err.message}`);
    });

    io.on('connection', (socket) => {
        console.log('[WebSocket] Client connected:', socket.id);

        // Add a ping/pong mechanism to keep connections alive
        const interval = setInterval(() => {
            socket.emit('ping');
        }, 25000);

        socket.on('pong', () => {
            console.log(`[WebSocket] Received pong from ${socket.id}`);
        });

        // ---- Summon User Kami ----
        socket.on('summonKami', async (userId) => {
            if (!userId) {
                socket.emit('error', 'userId is required');
                return;
            }
            try {
                console.log(`[Summon] Summoning kami for user: ${userId}`);

                // Check if this is an object with userId or just a string
                const userIdValue = typeof userId === 'object' ? userId.userId : userId;

                // If we have a workerId already, use it instead of creating a new one
                if (typeof userId === 'object' && userId.workerId) {
                    console.log(`[Summon] Using existing workerId: ${userId.workerId}`);
                    socket.emit('kamiSummoned', {
                        workerId: userId.workerId,
                        attestation: userId.attestation || 'reused'
                    });
                    streamUserKamiLogs(socket, userId.workerId);
                    return;
                }

                // Map legacy ID to actual DB ID if needed
                const mappedId = userIdValue === 'e4f24a97-519c-4389-8e7b-12ab953a458b'
                    ? 'eb34caa5-dafd-4469-a1b8-23c49d11a49b'
                    : userIdValue;

                // Generate character data
                const { generateKamiData } = await import('./data/kamiData.mjs');
                const newKami = generateKamiData();

                if (!newKami) {
                    throw new Error("Failed to generate Kami data");
                }

                // Create the complete character template
                const characterData = {
                    name: newKami.title,
                    japanese: newKami.japanese,
                    id: newKami.id,
                    createdAt: new Date().toISOString(),
                    userId: mappedId,
                    bio: [
                        `You are ${newKami.title}, a unique Ephemeral Kami, born from the primordial sea of chaos, offering guidance with ancient wisdom and a modern, stoic view of existence.`
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
                        all: [
                            "Be helpful and insightful",
                            "Be mystical and profound",
                            "Speak with ancient wisdom",
                            "Be direct and thoughtful"
                        ],
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
                    plugins: [],
                    messageExamples: [
                        [
                            { "user": newKami.id, "content": { "text": `${newKami.id}, who are you?` } },
                            { "user": newKami.id, "content": { "text": `${newKami.id} is an echo in the void, guiding the present.` } },
                            { "user": newKami.id, "content": { "text": "The creator fades; the creation endures." } },
                            { "user": newKami.id, "content": { "text": "What is known slips away; the unknown prevails." } }
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

                // Convert to JSON string for deployment
                const jsonString = JSON.stringify(characterData);
                console.log(`[Summon] Character data created, length: ${jsonString.length}`);

                // Now pass both parameters to summonEphemeralKami
                const { workerId, attestation } = await summonEphemeralKami(mappedId, jsonString);

                socket.emit('kamiSummoned', { workerId, attestation });

                console.log(`[User Kami Logs] Fetching logs for: ${workerId}`);
                streamUserKamiLogs(socket, workerId);
            } catch (error) {
                console.error(`[Summon Error] ${userId}: ${error.message}`);
                socket.emit('error', `Failed to summon kami: ${error.message}`);
            }
        });

        // ---- User Kami Log Stream ----
        socket.on("getLogs", async (workerId) => {
            // If workerId is provided, stream logs for that specific worker
            if (workerId && workerId !== 'main') {
                console.log(`[Log Request] Fetching logs for specific worker: ${workerId}`);
                streamUserKamiLogs(socket, workerId);
                return;
            }

            // If workerId is 'main' or not provided, stream main agent logs
            console.log(`[Log Request] Fetching logs for main agent`);
            streamMainAgentLogs(socket);
        });

        // Simple test endpoint
        socket.on('test', (message) => {
            console.log(`[WebSocket] Test message from ${socket.id}:`, message);
            socket.emit('test-response', 'Server received your test');
        });

        // Ping handler for keepalive
        socket.on('ping', () => {
            console.log(`[WebSocket] Ping received from ${socket.id}`);
            socket.emit('pong'); // Respond to keep connection alive
        });

        socket.on('disconnect', (reason) => {
            clearInterval(interval);
            console.log(`[WebSocket] Client disconnected: ${socket.id}, Reason: ${reason}`);
            // Clear any heartbeat intervals
            if (socket.data && socket.data.heartbeatInterval) {
                clearInterval(socket.data.heartbeatInterval);
            }
        });

        socket.on('error', (error) => {
            console.error(`[WebSocket Error] ${socket.id}: ${error.message}`);
        });
    });

    server.all('*', (req, res) => {
        console.log(`[Request] ${req.method} ${req.url}`);
        return handle(req, res);
    });

    const port = process.env.PORT || 3001;
    httpServer.listen(port, "0.0.0.0", () => {
        console.log(`[Server] Running on http://localhost:${port}`);
    });
}).catch((error) => {
    console.error('[Next.js] Failed to prepare app:', error);
    process.exit(1);
});