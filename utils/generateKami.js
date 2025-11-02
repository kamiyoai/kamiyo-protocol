// utils/generateKami.js
import { nanoid } from "nanoid";
import fs from "fs";
import path from "path";
import { createCanvas } from "canvas";

const prefixes = [
    "Ame-no", "Taka-mi", "Oho", "Tsuku", "Take-mi", "Susa",
    "Iza", "Kushi", "Haya", "Mika", "Naka", "Futsu", "Toyo"
];
const cores = [
    "Minaka", "Musubi", "Okuni", "Honokagutsuchi", "Tachikarao", "Wakahirume",
    "Nigihayahi", "Takeminakata", "Toyouke", "Kotoamatsukami",
    "Omotaru", "Kotoshironushi", "Sarutahiko"
];
const prefixesJP = [
    "アメノ", "タカミ", "オオ", "ツク", "タケミ", "スサ",
    "イザ", "クシ", "ハヤ", "ミカ", "ナカ", "フツ", "トヨ"
];
const coresJP = [
    "ミナカ", "ムスビ", "オオクニ", "ホノカグツチ", "タチカラオ", "ワカヒルメ",
    "ニギハヤヒ", "タケミナカタ", "トヨウケ", "コトアマツカミ",
    "オモタル", "コトシロヌシ", "サルタヒコ"
];

const generatePFNId = () => `PFN_${nanoid(8)}`;

const generateRandomKamiName = () => {
    const indexPrefix = Math.floor(Math.random() * prefixes.length);
    const indexCore = Math.floor(Math.random() * cores.length);
    return {
        title: `${prefixes[indexPrefix]}${cores[indexCore]}`,
        japanese: `${prefixesJP[indexPrefix]}${coresJP[indexCore]}`,
    };
};

/**
 * Generate a spiro-art image for a Kami
 * @param {string} kamiId - The ID of the Kami
 * @returns {Promise<string>} - The path to the generated image
 */
async function generateSpiroImage(kamiId) {
    try {
        const width = 512, height = 512;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext("2d");

        // Black background
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, width, height);

        let seedValue = Array.from(kamiId).reduce((acc, char) => acc + char.charCodeAt(0), 0);

// Use CommonJS module.exports instead of ES export
        const random = (min, max) => {
            // Simple seeded random function
            seedValue = (seedValue * 9301 + 49297) % 233280;
            return min + (seedValue / 233280) * (max - min);
        };

        module.exports = { random };

        // Choose pattern type (0-3) based on the first few chars of the ID
        const patternType = kamiId.charCodeAt(0) % 4;

        // Color schemes inspired by the example images
        const colorSchemes = [
            ["#00ffff", "#ff00ff"], // cyan and magenta
            ["#00ffff", "#ff00ff", "#ffff00"], // cyan, magenta, yellow
            ["#00cdff", "#ff00e6"], // blue-cyan and pink
            ["#00d0ff", "#ad00ff", "#ff00aa"] // cyan, purple, pink
        ];

        // Select color scheme based on kamiId
        const colorScheme = colorSchemes[kamiId.charCodeAt(1) % colorSchemes.length];

        // Generate spirogram based on pattern type
        switch (patternType) {
            case 0: // Möbius-like loop (Image 1)
                drawSpirogram1(ctx, width, height, colorScheme, kamiId);
                break;
            case 1: // Complex intertwined (Image 2)
                drawSpirogram2(ctx, width, height, colorScheme, kamiId);
                break;
            case 2: // Simple rounded (Image 3)
                drawSpirogram3(ctx, width, height, colorScheme, kamiId);
                break;
            case 3: // Wavy complex (Image 4)
                drawSpirogram4(ctx, width, height, colorScheme, kamiId);
                break;
        }

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

// Möbius-like loop (Image 1)
function drawSpirogram1(ctx, width, height, colors) {
    const centerX = width / 2;
    const centerY = height / 2;
    const lineCount = 80;

    ctx.lineWidth = 0.8;

    // Create a flowing loop pattern
    for (let i = 0; i < lineCount; i++) {
        const color = colors[i % colors.length];
        ctx.strokeStyle = color;
        ctx.beginPath();

        const r = 200;
        const offsetX = (i/lineCount) * 20;

        for (let theta = 0; theta < Math.PI * 6; theta += 0.05) {
            const x = centerX + (r * Math.cos(theta) + offsetX) * Math.sin(theta * 0.5);
            const y = centerY + r * Math.sin(theta);

            if (theta === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }

        ctx.stroke();
    }
}

// Complex intertwined (Image 2)
function drawSpirogram2(ctx, width, height, colors) {
    const centerX = width / 2;
    const centerY = height / 2;
    const lineCount = 60;

    ctx.lineWidth = 0.7;

    // Create a more complex intertwined pattern
    for (let i = 0; i < lineCount; i++) {
        const color = colors[i % colors.length];
        ctx.strokeStyle = color;
        ctx.beginPath();

        const r = 150 + (i/lineCount) * 50;
        const phase = (i/lineCount) * Math.PI;

        for (let theta = 0; theta < Math.PI * 4; theta += 0.03) {
            const factor = 1 + 0.3 * Math.sin(3 * theta + phase);
            const x = centerX + r * factor * Math.cos(theta + phase);
            const y = centerY + r * factor * Math.sin(2 * theta);

            if (theta === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }

        ctx.stroke();
    }
}

// Simple rounded (Image 3)
function drawSpirogram3(ctx, width, height, colors) {
    const centerX = width / 2;
    const centerY = height / 2;
    const lineCount = 50;

    ctx.lineWidth = 0.9;

    // Create a simple, rounded pattern
    for (let i = 0; i < lineCount; i++) {
        const color = colors[i % colors.length];
        ctx.strokeStyle = color;
        ctx.beginPath();

        const r = 140;
        const frequency = 2 + (i / lineCount) * 2;
        const phase = (i / lineCount) * Math.PI / 2;

        for (let theta = 0; theta < Math.PI * 4; theta += 0.05) {
            const factor = 1 + 0.2 * Math.sin(frequency * theta + phase);
            const x = centerX + r * factor * Math.cos(theta);
            const y = centerY + r * factor * Math.sin(theta);

            if (theta === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }

        ctx.stroke();
    }
}

// Wavy complex (Image 4)
function drawSpirogram4(ctx, width, height, colors) {
    const centerX = width / 2;
    const centerY = height / 2;
    const lineCount = 70;

    ctx.lineWidth = 0.6;

    // Create a wavy, stacked pattern
    for (let i = 0; i < lineCount; i++) {
        const color = colors[i % colors.length];
        ctx.strokeStyle = color;
        ctx.beginPath();

        const r = 170;
        const frequency = 3;
        const amplitude = 0.2 + (i / lineCount) * 0.3;
        const phase = (i / lineCount) * Math.PI;

        for (let theta = 0; theta < Math.PI * 4; theta += 0.02) {
            const factor = 1 + amplitude * Math.sin(frequency * theta + phase);
            const x = centerX + r * factor * Math.sin(theta * 1.5);
            const y = centerY + r * factor * Math.cos(theta * 1);

            if (theta === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }

        ctx.stroke();
    }
}

export const generateKami = async (user) => {
    try {
        const kamiName = generateRandomKamiName();
        const kamiId = generatePFNId();

        // Generate spirogram image directly
        let kamiImage;
        try {
            kamiImage = await generateSpiroImage(kamiId);
            console.log("Generated spirogram image at path:", kamiImage);
        } catch (imgError) {
            console.error("Image generation error:", imgError);
            kamiImage = "/media/kami/_kami.png";
        }

        return {
            id: kamiId,
            image: kamiImage,
            title: kamiName.title || "Kami",
            japanese: kamiName.japanese || "かみ",
            userId: user?.id || null,
        };
    } catch (error) {
        console.error("Error in generateKami:", error);
        // Return fallback data if generation fails
        return {
            id: generatePFNId(),
            image: "/media/kami/_kami.png",
            title: "Kami",
            japanese: "かみ",
            userId: user?.id || null,
        };
    }
};
