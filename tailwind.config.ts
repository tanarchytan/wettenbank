import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/ui/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "rijks-blue": "#154273",
        "rijks-link": "#007bc7",
        "rijks-tint": "#e5f1f9",
        "rijks-accent": "#b2d7ee",
        "neutral-bg": "#f3f3f3",
        "neutral-bg-2": "#e4f0ef",
        "rijks-border": "#ccc",
        "rijks-border-soft": "#b4b4b4",
        "rijks-text": "#000",
        "rijks-text-muted": "#333",
        "rijks-text-subdued": "#555",
        "rijks-error": "#d52b1e",
        "rijks-warning": "#e17000",
        "rijks-success": "#39870c",
      },
      fontFamily: {
        sans: ['"Rijksoverheid Sans"', '"Source Sans 3"', "system-ui", "sans-serif"],
      },
      maxWidth: {
        container: "1200px",
      },
    },
  },
  plugins: [],
};

export default config;
