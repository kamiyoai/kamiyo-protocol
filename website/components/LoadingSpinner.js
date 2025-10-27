// components/LoadingSpinner.js
"use client";
import { useEffect, useState } from "react";

const baseText = [
    "かみよ.えくすぷろいと", "KAMIYO.AI",
    "SCANNING CHAINS", "ちぇーんをすきゃん中...",
    "AGGREGATING EXPLOIT DATA", "えくすぷろいとでーたを集約中",
    "ANALYZING TRANSACTIONS", "とらんざくしょんを解析中",
    "DEFI PROTOCOL MONITORING", "でふぃぷろとこるを監視中",
    "BLOCKCHAIN INTEL SYNC", "ぶろっくちぇーんいんてる同期中",
    "VULNERABILITY FEED ACTIVE", "ぜいじゃくせい情報を受信中",
    "SMART CONTRACT VERIFICATION", "すまーとこんとらくとを検証中",
    "REKT NEWS AGGREGATION", "れくとにゅーすを集約中",
    "MEMPOOL ANALYSIS", "めむぷーるを分析中",
    "ON-CHAIN FORENSICS", "おんちぇーんふぉれんじっく実行中",
    "EXPLOIT PATTERN MATCHING", "えくすぷろいとぱたーんをまっちんぐ中",
];

const getRandomScramble = () => {
    const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
    let text = baseText[Math.floor(Math.random() * baseText.length)];

    const injectRandomNoise = (str) => {
        let chars = str.split("");
        for (let i = 0; i < chars.length; i++) {
            if (Math.random() > 0.9) { // Noise probability (~10%)
                chars[i] = Math.random() > 0.5
                    ? String.fromCharCode(33 + Math.random() * 15)  // Special characters (ASCII 33-47)
                    : String.fromCharCode(48 + Math.random() * 10); // Numbers (ASCII 48-57)
            }
        }
        return " " + chars.join(""); // Add a blank space before the scrambled text
    };


    if (Math.random() > 0.2) text = injectRandomNoise(text);
    return text + randomStr;
};

const LoadingSpinner = () => {
    const [scrambledText, setScrambledText] = useState(Array(30).fill(""));
    const [glitchSections, setGlitchSections] = useState([]);

    useEffect(() => {
        const interval = setInterval(() => {
            setScrambledText(Array(30).fill("").map(getRandomScramble));
        }, 800);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const glitchInterval = setInterval(() => {
            // Create 3-6 random horizontal sections that glitch
            const numSections = Math.floor(Math.random() * 4) + 3;
            const sections = [];

            for (let i = 0; i < numSections; i++) {
                sections.push({
                    top: Math.random() * 90, // Random vertical position (0-90%)
                    left: (Math.random() - 0.5) * 30, // Random horizontal offset (-15% to +15%)
                    opacity: Math.random() * 0.7 + 0.3, // 0.3 to 1.0
                    visible: Math.random() > 0.3, // 70% chance of being visible
                });
            }

            setGlitchSections(sections);
        }, 300); // Very fast glitching

        return () => clearInterval(glitchInterval);
    }, []);

    const renderTextRow = (startIndex, colorPattern) => (
        <div className="flex text-sm w-full justify-center py-3 whitespace-nowrap overflow-hidden">
            {scrambledText.slice(startIndex, startIndex + 20).map((text, i) => (
                <span
                    key={i}
                    className={`mx-1 text-xs ${
                        i % colorPattern[0] === 0 ? "text-[#FF00FF]" :
                        i % colorPattern[1] === 1 ? "text-[#4FE9EA]" :
                        "text-white"
                    }`}
                    style={{
                        animation: `fadeInOut ${Math.random() * 2 + 1}s infinite`,
                        opacity: Math.random() > 0.85 ? 0.3 : 1,
                    }}
                >
                    {text}
                </span>
            ))}
        </div>
    );

    return (
        <div className="fixed inset-0 w-screen h-screen overflow-hidden bg-black z-[999] opacity-75">
            {glitchSections.map((section, index) => (
                section.visible && (
                    <div
                        key={index}
                        className="absolute w-full"
                        style={{
                            top: `${section.top}%`,
                            left: `${section.left}%`,
                            opacity: section.opacity,
                            transform: `translateX(${section.left}%)`,
                            transition: "none"
                        }}
                    >
                        {renderTextRow(index * 5, [5, 3])}
                    </div>
                )
            ))}
        </div>
    );
};

export default LoadingSpinner;

