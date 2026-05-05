import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forest: "#16201A",
        forestdeep: "#0D1411",
        copper: "#A96132",
        copperdark: "#8B4E28",
        copperglow: "#C77845",
        cream: "#F5F0EA",
        creamdeep: "#EBE3D8",
        ink: "#1C2120",
        inkdim: "#3D3935",
        inkmuted: "#5C5853",
        wheat: "#D4C4A8",
        wheatlight: "#E5D8C0",
        danger: "#B7261A",
        dangersoft: "#FBEAE7",
        warn: "#9C6B0F",
        warnsoft: "#FBF1DC",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      letterSpacing: {
        editorial: "0.14em",
        editorialwide: "0.22em",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.6s ease-out forwards",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
