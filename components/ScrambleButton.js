import { useScrambleText } from "../hooks/useScrambleText";
import AnimatedDots from "./AnimatedDots";
import AnimatedNoiseText from "./AnimatedNoiseText";
import { useState } from "react";

export function ScrambleButton({ text = "Summon Kami", enabled = true, onClick, loading }) {
    const { text: scrambledText, setIsHovering } = useScrambleText(text, enabled);
    const [hovered, setHovered] = useState(false);

    return (
        <button
            className={`relative px-6 py-3 bg-transparent text-white text-xs uppercase mb-9 overflow-visible transition-all duration-300 select-none 
                ${enabled ? "cursor-pointer group" : "cursor-default opacity-90"}`}
            onMouseEnter={() => {
                if (enabled) {
                    setIsHovering(true);
                    setHovered(true);
                }
            }}
            onMouseLeave={() => {
                if (enabled) {
                    setIsHovering(false);
                    setHovered(false);
                }
            }}
            onClick={enabled ? onClick : undefined}
            disabled={loading || !enabled}
        >
            <span className="relative z-10 ml-8 tracking-wider transition-all duration-300 ease-out flex items-center min-w-max">
                {loading ? (
                    <>
                        <AnimatedNoiseText />
                        <AnimatedDots />
                    </>
                ) : (
                    scrambledText
                )}
            </span>

            {/* Base border that is always visible */}
            <span
                className={`absolute inset-0 border border-dotted skew-x-[-45deg] translate-x-4 transition-all duration-500 cta-gradient 
                    ${loading ? "opacity-0" : hovered ? "opacity-0" : "opacity-100"}`}
            />

            {/* Expanding tunnel rings on hover */}
            <span
                className={`absolute inset-0 border border-dotted skew-x-[-45deg] translate-x-4 transition-all duration-400 cta-gradient tunnel-1 
                    ${hovered ? "fade-out rotate-0 skew-x-[-65deg] scale-[2.2] opacity-100" : "rotate-85 skew-x-[-105deg] scale-100 opacity-0"}`}
                style={{ zIndex: -1 }}
            />
            <span
                className={`absolute inset-0 border skew-x-[-45deg] translate-x-4 transition-transform duration-300 cta-gradient tunnel-1 
                    ${hovered ? "rotate-0 skew-x-[55deg] scale-100 opacity-100" : "rotate-15 skew-x-[-95deg] scale-100 opacity-0"}`}
                style={{ zIndex: -1 }}
            />
            <span
                className={`absolute inset-0 border skew-x-[-45deg] translate-x-4 transition-transform duration-500 cta-gradient tunnel-2
                    ${hovered ? "fade-out rotate-0 skew-x-[-65deg] scale-[1.5] opacity-100" : "rotate-25 skew-x-[-55deg] scale-100 opacity-0"}`}
                style={{ zIndex: -2 }}
            />
            <span
                className={`absolute inset-0 border border-l-0 border-r-0 skew-x-[-45deg] translate-x-4 transition-transform duration-300 cta-gradient tunnel-3
                    ${hovered ? "rotate-0 skew-x-[-85deg] opacity-100" : "rotate-35 skew-x-[-105deg] opacity-0"}`}
                style={{ zIndex: -3 }}
            />
            <span
                className={`absolute inset-0 border skew-x-[-45deg] translate-x-4 transition-transform duration-900 cta-gradient tunnel-4
                    ${hovered ? "fade-out rotate-0 skew-x-[-15deg] scale-[1.8] opacity-100" : "rotate-45 skew-x-[-125deg] scale-100 opacity-0"}`}
                style={{ zIndex: -4 }}
            />
        </button>
    );
}
