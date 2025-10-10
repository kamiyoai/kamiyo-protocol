import { useEffect, useState } from 'react';

const Typewriter = ({ text, speed = 10, chunkSize = 8, className = "" }) => {
    const [displayedText, setDisplayedText] = useState("");

    useEffect(() => {
        let index = 0;
        setDisplayedText(""); // Reset when text changes
        const interval = setInterval(() => {
            setDisplayedText((prev) => prev + text.substr(index, chunkSize));
            index += chunkSize;
            if (index >= text.length) {
                clearInterval(interval);
            }
        }, speed);

        return () => clearInterval(interval);
    }, [text, speed, chunkSize]);

    return <span className={className}>{displayedText}</span>;
};

export default Typewriter;
