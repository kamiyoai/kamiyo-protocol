import type { Config } from "tailwindcss";
import { PluginAPI } from "tailwindcss/types/config";
import flowbite from 'flowbite/plugin'; // Import Flowbite plugin

export default {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      keyframes: {
        wave: {
          "0%, 100%": { transform: "translateY(0)" },
          "40%": { transform: "translateY(-12px)" },
          "60%": { transform: "translateY(5px)" },
        },
        gradientMove: {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
      },
      animation: {
        wave: "wave 1s infinite ease-in-out",
        "gradient-move": "gradientMove 3s linear infinite",
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        magenta: "#ff00ff",
        cyan: "#00ffff",
        orange: "#ffb343",
        dark: "#282d34",
        chalk: "#d1d5db",
        ash: "#32363d",
      },
    },
  },
  plugins: [
    function ({ addUtilities }: PluginAPI) {
      addUtilities({
        ".center-button": {
          transform: "translateX(calc(-50% + 3.75rem))",
          "margin-top": "1rem",
        },
        ".button-wrapper": {
          display: "flex",
          "justify-content": "center",
          "align-items": "center",
          position: "relative",
        },
      });
    },
    flowbite, // Add Flowbite plugin
  ],
} satisfies Config;
