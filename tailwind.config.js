/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a0f",
        surface: "#14141c",
        card: "#1c1c26",
        border: "#2a2a3a",
        accent: "#7c3aed",
        accent2: "#06b6d4",
        hydra: "#8b5cf6"
      },
      fontFamily: { sans: ["Inter","Segoe UI","sans-serif"], display: ["Space Grotesk","sans-serif"] },
      backdropBlur: { xs: "2px" },
      animation: { glow: "glow 3s ease-in-out infinite", float: "float 6s ease-in-out infinite" },
      keyframes: {
        glow: { "0%,100%": { opacity: 1 }, "50%": { opacity: 0.6 } },
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-6px)" } }
      }
    }
  },
  plugins: []
}
