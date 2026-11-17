/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        fundo: "#0E0F11",
        s1: "#16181B",
        s2: "#1E2024",
        s3: "#272A2F",
        line: "#2C2F35",
        ink: "#E8EAED",
        mute: "#8B9098",
        dim: "#5B6068",
        neon: "#39FF14",
        quente: "#FF4D3D",
        morno: "#FFB020",
        frio: "#4CC2FF",
      },
      fontFamily: {
        display: ["Orbitron", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        neon: "0 0 0 1px rgba(57,255,20,.35), 0 8px 30px -8px rgba(57,255,20,.35)",
      },
    },
  },
  plugins: [],
};
