import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#080184",
        royal: "#022DEC",
        cyan: "#00E2FF",
      },
    },
  },
  plugins: [],
};
export default config;
