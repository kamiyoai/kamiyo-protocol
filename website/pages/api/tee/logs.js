// pages/api/tee/logs.js
export default async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { workerId } = req.query;
    if (!workerId) {
        return res.status(400).json({ error: "Worker ID required" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    try {
        const waitForLogs = async (workerId, maxAttempts = 5, delay = 3000) => {
            for (let i = 0; i < maxAttempts; i++) {
                const logs = await getTEELogs(workerId);
                if (logs && logs.trim().length > 0) return logs;
                console.log(`Waiting for logs... Attempt ${i + 1}/${maxAttempts}`);
                await new Promise(res => setTimeout(res, delay));
            }
            return "No logs received.";
        };
        const { getTEELogs } = await import("../../../lib/tee.mjs");
        const initialLogs = await getTEELogs(workerId);
        res.write(`data: ${initialLogs}\n\n`);

        // Simulate streaming (replace with real TEE log polling if CLI supports)
        const interval = setInterval(async () => {
            const logs = await waitForLogs(workerId);
            res.write(`data: ${logs}\n\n`);
        }, 5000);

        req.on("close", () => {
            clearInterval(interval);
            res.end();
        });
    } catch (error) {
        console.error("Log streaming error:", error.message);
        res.write(`data: Error: ${error.message}\n\n`);
        res.end();
    }

}