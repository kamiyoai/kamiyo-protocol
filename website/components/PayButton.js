// components/PayButton.js
import { useState } from "react";
import { useScrambleText } from "../hooks/useScrambleText";

export default function PayButton({
                                      textOverride = "Summon a Kami",  // Default text, overridden by services.js
                                      onClickOverride,                // Custom onClick from services.js
                                      disabled = false                // Controlled by services.js
                                  }) {
    const [loading, setLoading] = useState(false);
    const isEnabled = !disabled && !loading; // Only scramble if not disabled and not loading
    const displayText = loading ? "Processing..." : textOverride; // Use textOverride instead of hardcoded text
    const { text, setIsHovering } = useScrambleText(displayText, isEnabled);

    const handlePayment = async () => {
        if (onClickOverride) {
            setLoading(true);
            await onClickOverride(); // Use the passed-in onClick from services.js
            setLoading(false);
        } else {
            setLoading(true);
            try {
                const res = await fetch("/api/payment/checkout", { method: "POST" });
                const data = await res.json();
                if (data.sessionId) {
                    window.location = `https://checkout.stripe.com/pay/${data.sessionId}`;
                }
            } catch (error) {
                console.error("Payment request failed:", error);
            } finally {
                setLoading(false);
            }
        }
    };

    return (
        <button
            onClick={isEnabled ? handlePayment : undefined} // Prevent click if disabled or loading
            onMouseEnter={() => isEnabled && setIsHovering(true)} // Prevent hover if disabled or loading
            onMouseLeave={() => isEnabled && setIsHovering(false)}
            disabled={!isEnabled} // Disable when loading or if explicitly disabled
            className={`group transition-all duration-300 relative px-6 py-3 bg-transparent text-white text-xs uppercase overflow-visible -ml-8
                ${!isEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
            {/* Button text */}
            <span className="relative z-10 ml-8 tracking-wider transition-all duration-300 ease-out">
                {text}
            </span>

            {/* Borders with conditional hover effects */}
            <span className={`absolute inset-0 border border-dotted cta-gradient skew-x-[-45deg] translate-x-4 transition-all duration-300 ${isEnabled ? "" : ""}`} />
            <span className={`absolute inset-0 border-r border-dotted cta-gradient-border-right skew-x-[-45deg] translate-x-4 transition-all duration-300 ${isEnabled ? "" : ""}`} />
            <span className={`absolute bottom-0 left-[-4px] w-full border-b border-dotted cta-gradient-border-bottom transition-all duration-300 ${isEnabled ? "" : ""}`} />
        </button>
    );
}