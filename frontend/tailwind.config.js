/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          0: "#07060f",
          1: "#0c0a1a",
          2: "#13102a",
          3: "#1a1538",
        },
        ink: {
          0: "#f5f3ff",
          1: "#e2dcff",
          2: "#a99bd9",
          3: "#6c5fa0",
          4: "#3b3463",
        },
        neon: {
          violet: "#7c3aed",
          purple: "#a78bfa",
          rose: "#f43f5e",
          cyan: "#22d3ee",
          lime: "#a3e635",
          amber: "#fbbf24",
        },
      },
      fontFamily: {
        mono: ['"Fira Code"', "ui-monospace", "monospace"],
        sans: ['"Fira Sans"', "ui-sans-serif", "system-ui"],
        display: ['"Space Grotesk"', '"Fira Sans"', "ui-sans-serif"],
      },
      boxShadow: {
        glow: "0 0 24px -4px rgba(124,58,237,0.55)",
        "glow-rose": "0 0 24px -4px rgba(244,63,94,0.55)",
        "glow-cyan": "0 0 24px -4px rgba(34,211,238,0.55)",
      },
      animation: {
        "scan": "scan 4s linear infinite",
        "pulse-slow": "pulse 3s cubic-bezier(0.4,0,0.6,1) infinite",
        "drift": "drift 18s ease-in-out infinite",
        "flicker": "flicker 6s steps(8,end) infinite",
      },
      keyframes: {
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        drift: {
          "0%,100%": { transform: "translate(0,0)" },
          "50%": { transform: "translate(20px,-20px)" },
        },
        flicker: {
          "0%,100%": { opacity: "1" },
          "20%": { opacity: ".82" },
          "40%": { opacity: "1" },
          "60%": { opacity: ".94" },
          "80%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
