/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // A fixed light surface, not a re-theme.
        ground: "#ddf8ff",   // pale ice; the ground the cards sit on
        brand: {
          DEFAULT: "#006a87", // deep teal — structure, and the colour of verified evidence
          soft: "#e6f4f8",    // teal at low strength, for verified chip fills
        },
        accent: "#ff6e30",    // orange — primary actions only
      },
      boxShadow: {
        // Tinted with the brand hue: a neutral black shadow over the pale ground reads as dirt.
        card: "0 1px 2px rgba(0, 76, 97, 0.04), 0 4px 12px rgba(0, 76, 97, 0.05)",
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        serif: ['"IBM Plex Serif"', 'Georgia', 'serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
