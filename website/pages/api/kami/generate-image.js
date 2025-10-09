// utils/generateImage.js
import fs from "fs";
import path from "path";
import { createCanvas } from "canvas";

/**
 * Generate a Kami image and save it to the public directory
 * @param {string} kamiId - The ID of the Kami
 * @returns {Promise<string>} - The path to the generated image
 */
export async function generateKamiImage(kamiId) {
    try {
        const width = 512, height = 512;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext("2d");

        // Black background
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, width, height);

        // Colors for spirogram lines (more vibrant for better visibility)
        const colors = ["#00ffff", "#ff00ff", "#ffff00"];
        const lineCount = 40; // More lines for density

        // Generate spirogram-like pattern using parametric equations
        ctx.lineWidth = 1.2; // Thicker lines for better visibility
        for (let i = 0; i < lineCount; i++) {
            ctx.strokeStyle = colors[i % colors.length];
            ctx.beginPath();

            const r = 180 + Math.sin(i * 0.1) * 80; // Larger radius with more variation
            const t = (Math.PI * 2 * i) / lineCount; // Angle for spirogram
            const offsetX = width / 2;
            const offsetY = height / 2;

            // Use a default n value for the spirogram equation
            const n = 2 + (i % 5) * 0.5; // More varied complexity

            // Spirogram equation with more interesting patterns
            for (let theta = 0; theta < Math.PI * 6; theta += 0.01) {
                const x = offsetX + r * Math.cos(theta + t) * Math.sin(theta * 0.2);
                const y = offsetY + r * Math.sin(n * theta + t) * Math.cos(theta * 0.3);
                if (theta === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        // Add a subtle glow effect
        ctx.shadowBlur = 20;
        ctx.shadowColor = "rgba(255, 255, 255, 0.5)";
        ctx.beginPath();
        ctx.arc(width/2, height/2, 150, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Add identifier text
        ctx.font = "bold 20px Arial";
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.textAlign = "center";
        ctx.shadowBlur = 4;
        ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
        ctx.fillText(kamiId, width/2, height - 20);

        // Save with a timestamp to avoid caching issues
        const timestamp = Date.now();
        const imgPath = `/media/kami/${kamiId}_${timestamp}.png`;
        const fullPath = path.join(process.cwd(), "public", imgPath);

        // Ensure directory exists
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Save image to file
        const out = fs.createWriteStream(fullPath);
        const stream = canvas.createPNGStream();

        return new Promise((resolve, reject) => {
            stream.pipe(out);
            out.on("finish", () => {
                console.log(`Image successfully generated and saved to ${imgPath}`);
                resolve(imgPath);
            });
            out.on("error", (err) => {
                console.error("Error saving image:", err);
                reject(err);
            });
        });
    } catch (error) {
        console.error("Error generating image:", error);
        return "/media/kami/_kami.png"; // Return default image on error
    }
}