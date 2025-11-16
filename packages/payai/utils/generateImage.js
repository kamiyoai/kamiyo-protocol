// utils/generateImage.js
export const generateKamiImage = async (kamiId) => {
    if (typeof window !== "undefined") {
        console.warn("Cannot run generateKamiImage client-side. Using fallback image.");
        return "/media/kami/_kami.png"; // Fallback image for client-side
    }

    try {
        const res = await fetch("/api/generate-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kamiId }),
        });

        if (!res.ok) throw new Error("Failed to generate kami image");

        const data = await res.json();
        return data.imagePath || "/media/kami/_kami.png";
    } catch (error) {
        console.error("Error fetching image:", error);
        return "/media/kami/_kami.png"; // Fallback image
    }
};
