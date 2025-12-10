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
                    }, 1200);
                }, 4000);
            }, 1200);
        };

        const scramble = () => {
            setIsGlitching(true);
            let progress = 0;
            let iterations = 0;
            const maxIterations = text.length * 4;
            clearInterval(intervalRef.current);
            intervalRef.current = setInterval(() => {
                iterations++;
                if (iterations >= maxIterations) {
                    clearInterval(intervalRef.current);
                    setDisplayText(text);
                    return;
                }
                const revealPoint = Math.floor(iterations / 4);
                setDisplayText(
                    text
                        .split("")
                        .map((char, index) =>
                            index < revealPoint
                                ? text[index]
                                : chars[Math.floor(Math.random() * chars.length)]
                        )
                        .join("")
                );
            }, 80);
        };

        runCycle();
        const cycleInterval = setInterval(runCycle, 12000);

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
                animation: !isGlitching ? "opacityGlitchSubtle 3s ease-in-out infinite" : "none"
            }}
        >
            {displayText}
        </span>
    );
}
