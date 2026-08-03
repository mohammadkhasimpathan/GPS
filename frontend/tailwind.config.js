/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        // GuardianLink brand palette
        brand: {
          50:  "#eef6ff",
          100: "#d9ebff",
          200: "#bcd9ff",
          300: "#8ec0ff",
          400: "#599dfc",
          500: "#3b7af8",
          600: "#2259ed",
          700: "#1b46da",
          800: "#1d39b0",
          900: "#1d358b",
          950: "#152254",
        },
        // Dark surface palette
        surface: {
          950: "#080c18",
          900: "#0d1120",
          800: "#111828",
          700: "#182030",
          600: "#1e2840",
          500: "#253050",
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "glass": "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
      },
      backdropBlur: {
        xs: "2px",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4,0,0.6,1) infinite",
        "ping-slow": "ping 2s cubic-bezier(0,0,0.2,1) infinite",
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      boxShadow: {
        glass: "0 4px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.08)",
        glow: "0 0 20px rgba(59,122,248,0.4)",
        "glow-sm": "0 0 10px rgba(59,122,248,0.25)",
      },
    },
  },
  plugins: [],
};
