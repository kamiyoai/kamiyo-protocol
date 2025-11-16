//hooks/useScrambleText.js
import { useState, useEffect } from "react";

export function useScrambleText(originalText, enabled = true, loading = false) {
    const [text, setText] = useState(loading ? "Initiating..." : originalText);
    const [isHovering, setIsHovering] = useState(false);
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let scrambleInterval;

    useEffect(() => {
        if (!enabled) {
            setText(originalText); // Reset text immediately when disabled
            return;
        }

        if (loading) {
            continuousScramble(); // Keep scrambling until loading is done
            return;
        }

        if (isHovering) {
            scrambleLetters();
        } else {
            descrambleLetters();
        }

        return () => clearInterval(scrambleInterval);
    }, [isHovering, enabled, loading]);

    function continuousScramble() {
        let tempText = originalText.split("").map(() => chars[Math.floor(Math.random() * chars.length)]).join("");
        setText(tempText);

        scrambleInterval = setInterval(() => {
            setText(
                originalText
                    .split("")
                    .map(() => chars[Math.floor(Math.random() * chars.length)])
                    .join("")
            );
        }, 50);
    }

    function scrambleLetters() {
        if (!enabled) return;

        let progress = 0;
        scrambleInterval = setInterval(() => {
            if (progress >= originalText.length) {
                clearInterval(scrambleInterval);
                return;
            }
            setText((prevText) =>
                prevText
                    .split("")
                    .map((char, index) =>
                        index < progress
                            ? originalText[index]
                            : chars[Math.floor(Math.random() * chars.length)]
                    )
                    .join("")
            );
            progress++;
        }, 45);
    }

    function descrambleLetters() {
        if (!enabled) return;

        let progress = originalText.length;
        scrambleInterval = setInterval(() => {
            if (progress <= 0) {
                clearInterval(scrambleInterval);
                setText(originalText);
                return;
            }
            setText((prevText) =>
                prevText
                    .split("")
                    .map((char, index) =>
                        index >= progress ? originalText[index] : chars[Math.floor(Math.random() * chars.length)]
                    )
                    .join("")
            );
            progress--;
        }, 35);
    }

    return { text, setIsHovering };
}
