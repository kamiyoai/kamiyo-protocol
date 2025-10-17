// server-ephemeral.mjs
import express from 'express';
import next from 'next';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { summonEphemeralKami } from './lib/tee.mjs';
import axios from "axios";

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    const server = express();
    const httpServer = createServer(server);
    const io = new Server(httpServer, {
        cors: { origin: '*' },
        transports: ["websocket"],
        path: "/socket.io",
        allowEIO3: true
    });

    // Define the streamUserKamiLogs function outside of the event handlers
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
            const USER_KAMI_LOGS_URL = `https://b39afb7ea03324a0ddd5e457364be623728b7819-8090.dstack-prod5.phala.network/logs/${workerId}?text&bare&timestamps&follow&tail=400`;
            console.log(`[User Kami Logs] Fetching logs for worker: ${workerId} from URL: ${USER_KAMI_LOGS_URL}`);

            const response = await axios.get(USER_KAMI_LOGS_URL, {
                responseType: 'stream',
                timeout: 30000 // 30 second timeout
            });

            response.data.on('data', (chunk) => {
                const logData = chunk.toString().trim();
                if (logData) {
                    // Only log the first part of potentially long log entries
                    console.log(`[User Kami Logs] Received (${workerId}):`, logData.substring(0, 100) + (logData.length > 100 ? '...' : ''));
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

    io.on('connection', (socket) => {
        console.log('[User Kami WebSocket] Client connected:', socket.id);

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

                const characterData = {
                    name: newKami.title,
                    japanese: newKami.japanese,
                    id: newKami.id,
                    createdAt: new Date().toISOString(),
                    userId: mappedId,
                };

                // Convert to base64
                const jsonString = JSON.stringify(characterData);
                const base64CharacterData = Buffer.from(jsonString, "utf8").toString("base64");

                console.log(`[Summon] Character data created, length: ${base64CharacterData.length}`);

                // Now pass both parameters to summonEphemeralKami
                const { workerId, attestation } = await summonEphemeralKami(mappedId, base64CharacterData);

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
            if (!workerId) {
                socket.emit("error", "workerId is required");
                return;
            }
            console.log(`[Log Request] Fetching logs for: ${workerId}`);
            streamUserKamiLogs(socket, workerId);
        });

        socket.on('disconnect', (reason) => {
            console.log(`[User Kami WebSocket] Client disconnected: ${socket.id}, Reason: ${reason}`);
            // Clear any heartbeat intervals
            if (socket.data && socket.data.heartbeatInterval) {
                clearInterval(socket.data.heartbeatInterval);
            }
        });

        socket.on('error', (error) => {
            console.error(`[User Kami WebSocket Error] ${socket.id}: ${error.message}`);
        });
    });

    server.all('*', (req, res) => handle(req, res));

    const port = process.env.USER_KAMI_PORT || 3002;
    httpServer.listen(port, "0.0.0.0", () => {
        console.log(`[User Kami Server] Running on http://localhost:${port}`);
    });
});