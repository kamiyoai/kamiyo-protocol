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

    useEffect(() => {
        const interval = setInterval(() => {
            setScrambledText(Array(30).fill("").map(getRandomScramble));
        }, 800);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="fixed inset-0 w-screen h-screen flex flex-col items-center justify-center overflow-hidden bg-black z-[999] opacity-75">
            <div className="flex text-sm w-full justify-center py-10">
                {scrambledText.slice(0, 15).map((text, i) => (
                    <span
                        key={i}
                        className={`mx-1 text-xs ${i % 5 === 0 ? "text-[#FF00FF]" : i % 5 === 1 ? "text-[#4FE9EA]" : "text-chalk"}`}
                        style={{
                            animation: `fadeInOut ${Math.random() * 2 + 1}s infinite`,
                            opacity: Math.random() > 0.9 ? 0.2 : 1,
                        }}
                    >
                        {text}
                    </span>
                ))}
            </div>

            <div className="pl-96 flex text-sm w-full justify-center py-10">
                {scrambledText.slice(0, 15).map((text, i) => (
                    <span
                        key={i}
                        className={`mx-1 text-xs ${i % 8 === 0 ? "text-[#FF00FF]" : i % 7 === 1 ? "text-[#4FE9EA]" : "text-white"}`}
                        style={{
                            animation: `fadeInOut ${Math.random() * 3 + 1}s infinite`,
                            opacity: Math.random() > 0.9 ? 0.2 : 1,
                        }}
                    >
                        {text}
                    </span>
                ))}
            </div>

            <div className="pl-32 flex text-sm w-full justify-center py-10">
                {scrambledText.slice(0, 15).map((text, i) => (
                    <span
                        key={i}
                        className={`mx-1 text-xs ${i % 3 === 0 ? "text-[#FF00FF]" : i % 2 === 1 ? "text-[#4FE9EA]" : "text-white"}`}
                        style={{
                            animation: `fadeInOut ${Math.random() * 3 + 1}s infinite`,
                            opacity: Math.random() > 0.9 ? 0.2 : 1,
                        }}
                    >
                        {text}
                    </span>
                ))}
            </div>
        </div>
    );
};

export default LoadingSpinner;

