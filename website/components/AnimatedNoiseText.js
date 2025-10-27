import { useEffect, useState, useMemo } from "react";

const injectRandomNoise = (str) => {
    let chars = str.split("");
    for (let i = 0; i < chars.length; i++) {
        if (Math.random() > 0.85) { // Noise probability (~15%)
            chars[i] = Math.random() > 0.5
                ? String.fromCharCode(33 + Math.random() * 15)  // Special characters (!"#$%&)
                : String.fromCharCode(48 + Math.random() * 10); // Numbers (0123456789)
        }
    }
    return chars.join("");
};

// Blockchain exploit-themed loading messages
const LOADING_MESSAGES = [
    "Scanning transaction pool",
    "Tracing exploit vectors",
    "Monitoring mempool activity",
    "Aggregating security feeds",
    "Decoding attack patterns",
    "Analyzing smart contracts",
    "Tracking suspicious txs",
    "Validating exploit data",
    "Querying blockchain nodes",
    "Detecting reentrancy",
];

const AnimatedNoiseText = ({ baseText, interval = 500 }) => {
    // Pick a random message once when component mounts
    const randomMessage = useMemo(() => {
        const messages = baseText ? [baseText] : LOADING_MESSAGES;
        return messages[Math.floor(Math.random() * messages.length)];
    }, [baseText]);

    const [scrambledText, setScrambledText] = useState(randomMessage);

    useEffect(() => {
        const scrambleInterval = setInterval(() => {
            setScrambledText(injectRandomNoise(randomMessage));
        }, interval);

        return () => clearInterval(scrambleInterval);
    }, [randomMessage, interval]);

    return <span className="text-white tracking-wider">{scrambledText}</span>;
};

export default AnimatedNoiseText;
