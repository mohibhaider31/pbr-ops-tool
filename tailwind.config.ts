import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Archivo", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        paper: "#F4F2ED",
        ink: "#141412",
        rail: "#171613",
        railRaised: "#1C1A17",
        railPopover: "#201E1A",
        railBorder: "#2C2924",
        railBorderLight: "#3A3730",
        railText: "#EFEBE2",
        railMuted: "#8B8579",
        railMuted2: "#77726A",
        railMuted3: "#6E6A60",
        accent: "#DA3B12",
        accentHover: "#B92F0D",
        key: "#C13A16",
        keyHover: "#8F2A0F",
        border: "#DDD9D0",
        borderLight: "#E4E0D7",
        borderFaint: "#F0EDE6",
        muted: "#6B675E",
        muted2: "#8F8A7F",
        muted3: "#9A948A",
        muted4: "#A9A398",
        cream: "#FBFAF7",
        amberBg: "#F7EBD4",
        amberBorder: "#E3D3B4",
        amberText: "#8A5A0B",
        amberTextDark: "#6E470A",
        good: "#2E8A5F",
        goodLight: "#5FA97C",
      },
    },
  },
  plugins: [],
};
export default config;
