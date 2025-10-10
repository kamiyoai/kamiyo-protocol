import WebSocket from 'ws';
import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.WEBSOCKET_PORT || 8080;
const TEE_AGENT_API = process.env.TEE_AGENT_URL || "http://your-tee-server-ip:5000/chat";

// Create a WebSocket server
const wss = new WebSocket.Server({ port: PORT }, () => {
    console.log(`WebSocket server running on ws://localhost:${PORT}`);
});

wss.on('connection', (ws) => {
    console.log("New WebSocket connection established.");

    ws.on('message', async (message) => {
        console.log(`Received from client: ${message}`);

        try {
            // Send message to TEE agent HTTP API
            const response = await fetch(TEE_AGENT_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message }),
            });

            if (!response.ok) throw new Error("TEE API response error");

            const data = await response.json();
            console.log(`Received from TEE Agent: ${data.response}`);

            // Send response back to WebSocket client
            ws.send(data.response);

        } catch (error) {
            console.error("Error communicating with TEE API:", error);
            ws.send("Error processing your message.");
        }
    });

    ws.on('close', () => {
        console.log("WebSocket connection closed.");
    });
});

// Start Express server
app.listen(Number(PORT) + 1, () => {
    console.log(`Express server running on http://localhost:${Number(PORT) + 1}`);
});
