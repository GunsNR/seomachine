import type { Config } from "tailwindcss";

// Semantic tokens — see replica/design.md §4. Literals live only here and in globals.css.
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#0c0d0e", 2: "#646c6c" },
        canvas: "#eef0ef",
        surface: "#ffffff",
        line: { DEFAULT: "#dbdcdb", strong: "#c4c7c6" },
        action: { DEFAULT: "#b0532c", hover: "#984624", ink: "#8f3f1f", soft: "#f6e9e2" },
        accent: "#d16c42",
        rail: { DEFAULT: "#0c0d0e", 2: "#1b1d1f", ink: "#dbdcdb", muted: "#9aa1a1" },
        ok: { DEFAULT: "#1f6f4a", soft: "#e3f1ea" },
        warn: { DEFAULT: "#8a5a00", soft: "#f8eed9" },
        bad: { DEFAULT: "#b42318", soft: "#fbe7e5" },
        info: { DEFAULT: "#1d5fa8", soft: "#e4eef9" },
      },
      fontFamily: { sans: ['"Schibsted Grotesk Variable"', "system-ui", "-apple-system", "Segoe UI", "sans-serif"] },
      fontSize: { "2xs": ["12px", "16px"], xs: ["13px", "18px"], sm: ["14px", "20px"], base: ["16px", "24px"], lg: ["20px", "28px"], xl: ["24px", "30px"], "2xl": ["30px", "36px"] },
      borderRadius: { ctl: "6px", panel: "10px" },
      maxWidth: { content: "1240px" },
    },
  },
  plugins: [],
} satisfies Config;
