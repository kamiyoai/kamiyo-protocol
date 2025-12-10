import { useState, useEffect, useRef } from "react";

export default function GlitchLabel({ text = "testing" }) {
    const [displayText, setDisplayText] = useState(text);
    const [isGlitching, setIsGlitching] = useState(false);
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const intervalRef = useRef(null);
    const timeoutRef = useRef(null);

    useEffect(() => {
        const runCycle = () => {
            scramble();
            timeoutRef.current = setTimeout(() => {
                setDisplayText(text);
                setIsGlitching(false);
                timeoutRef.current = setTimeout(() => {
                    scramble();
                    timeoutRef.current = setTimeout(() => {
                        setDisplayText(text);
                        setIsGlitching(false);
                    }, 600);
                }, 2000);
            }, 600);
        };

        const scramble = () => {
            setIsGlitching(true);
            let progress = 0;
            clearInterval(intervalRef.current);
            intervalRef.current = setInterval(() => {
                if (progress >= text.length) {
                    clearInterval(intervalRef.current);
                    return;
                }
                setDisplayText(prev =>
                    text
                        .split("")
                        .map((char, index) =>
                            index < progress
                                ? text[index]
                                : chars[Math.floor(Math.random() * chars.length)]
                        )
                        .join("")
                );
                progress++;
            }, 50);
        };

        runCycle();
        const cycleInterval = setInterval(runCycle, 6000);

        return () => {
            clearInterval(intervalRef.current);
            clearInterval(cycleInterval);
            clearTimeout(timeoutRef.current);
        };
    }, [text]);

    return (
        <span
            className="text-white text-xs font-medium tracking-widest uppercase"
            style={{
                animation: isGlitching ? "opacityGlitch 1.2s ease-in-out infinite" : "none"
            }}
        >
            {displayText}
        </span>
    );
}
