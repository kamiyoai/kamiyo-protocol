// components/LoadingSpinner.js
"use client";
import { useEffect, useState } from "react";

const baseText = [
    "かみよ.えーあい", "KAMIYO.AI",
    "x402 PROTOCOL ACTIVE", "x402プロトコル起動中",
    "PROCESSING PAYMENT", "ペイメント処理中...",
    "VERIFYING TRANSACTION", "トランザクション検証中",
    "AI AGENT AUTHENTICATED", "AIエージェント認証済",
    "HTTP 402 HANDSHAKE", "HTTP402ハンドシェイク中",
    "USDC PAYMENT CONFIRMED", "USDC支払い確認完了",
    "ON-CHAIN VERIFICATION", "オンチェーン検証中",
    "PAYMENT TOKEN MINTED", "ペイメントトークン発行中",
    "AUTONOMOUS AGENT ONLINE", "自律エージェントオンライン",
    "BASE NETWORK CONNECTED", "Baseネットワーク接続済",
    "BLOCKCHAIN PAYMENT SYNC", "ブロックチェーン支払い同期中",
    "FACILITATOR ACTIVE", "ファシリテーター起動中",
    "AGENT API ACCESS GRANTED", "エージェントAPI接続許可",
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
    const [mounted, setMounted] = useState(false);
    const [scrambledText, setScrambledText] = useState(Array(30).fill(""));

    useEffect(() => {
        setMounted(true);
        setScrambledText(Array(30).fill("").map(getRandomScramble));
    }, []);

    useEffect(() => {
        if (!mounted) return;
        const interval = setInterval(() => {
            setScrambledText(Array(30).fill("").map(getRandomScramble));
        }, 800);
        return () => clearInterval(interval);
    }, [mounted]);

    if (!mounted) {
        return (
            <div className="fixed inset-0 w-screen h-screen flex flex-col items-center justify-center overflow-hidden bg-black z-[999] opacity-75" />
        );
    }

    return (
        <div className="fixed inset-0 w-screen h-screen flex flex-col items-center justify-center overflow-hidden bg-black z-[999] opacity-75">
            <div className="flex text-sm w-full justify-center py-10">
                {scrambledText.slice(0, 15).map((text, i) => (
                    <span
                        key={i}
                        className={`mx-1 text-xs ${i % 5 === 0 ? "text-[#FF00FF]" : i % 5 === 1 ? "text-[#4FE9EA]" : "text-chalk"}`}
                        style={{
                            animation: `fadeInOut ${1 + (i % 3)}s infinite`,
                            opacity: i % 7 === 0 ? 0.2 : 1,
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
                            animation: `fadeInOut ${1.5 + (i % 4)}s infinite`,
                            opacity: i % 9 === 0 ? 0.2 : 1,
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
                            animation: `fadeInOut ${2 + (i % 3)}s infinite`,
                            opacity: i % 11 === 0 ? 0.2 : 1,
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
