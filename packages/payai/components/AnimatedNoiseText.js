import { useEffect, useState } from "react";

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

const AnimatedNoiseText = ({ baseText = "Initiating summon mode", interval = 500 }) => {
    const [scrambledText, setScrambledText] = useState(baseText);

    useEffect(() => {
        const scrambleInterval = setInterval(() => {
            setScrambledText(injectRandomNoise(baseText));
        }, interval);

        return () => clearInterval(scrambleInterval);
    }, [baseText, interval]);

    return <span className="text-white tracking-wider">{scrambledText}</span>;
};

export default AnimatedNoiseText;
