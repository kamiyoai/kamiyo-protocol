// components/PayButton.js
import { useState } from "react";
import { useRouter } from "next/router";
import { useScrambleText } from "../hooks/useScrambleText";

export default function PayButton({
                                      textOverride,
                                      onClickOverride,
                                      disabled = false
                                  }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    // Default: Go to MCP pricing page
    const defaultText = "Add to Claude Desktop";
    const defaultAction = () => router.push('/pricing');

    const text = textOverride || defaultText;
    const action = onClickOverride || defaultAction;

    const isEnabled = !disabled && !loading;
    const displayText = loading ? "Processing..." : text;
    const { text: scrambledText, setIsHovering } = useScrambleText(displayText, isEnabled);

    const handlePayment = async () => {
        if (isEnabled) {
            setLoading(true);
            await action();
            setLoading(false);
        }
    };

    return (
        <button
            onClick={isEnabled ? handlePayment : undefined}
            onMouseEnter={() => isEnabled && setIsHovering(true)}
            onMouseLeave={() => isEnabled && setIsHovering(false)}
            disabled={!isEnabled}
            className={`group transition-all duration-300 relative px-6 py-3 bg-transparent text-white text-xs uppercase overflow-visible -ml-8
                ${!isEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
            {/* Button text */}
            <span className="relative z-10 ml-8 tracking-wider transition-all duration-300 ease-out">
                {scrambledText}
            </span>

            {/* Borders with conditional hover effects */}
            <span className={`absolute inset-0 border border-dotted cta-gradient skew-x-[-45deg] translate-x-4 transition-all duration-300 ${isEnabled ? "" : ""}`} />
            <span className={`absolute inset-0 border-r border-dotted cta-gradient-border-right skew-x-[-45deg] translate-x-4 transition-all duration-300 ${isEnabled ? "" : ""}`} />
            <span className={`absolute bottom-0 left-[-4px] w-full border-b border-dotted cta-gradient-border-bottom transition-all duration-300 ${isEnabled ? "" : ""}`} />
        </button>
    );
}
