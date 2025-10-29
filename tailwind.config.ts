import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          // dGEN1 brand colors inspired by Freedom Factory
          primary: '#00FF88', // Neon green accent
          secondary: '#0066FF', // Electric blue
          accent: '#FF0066', // Hot pink
          'primary-dark': '#00CC6A',
          'secondary-dark': '#0052CC',
          'accent-dark': '#CC0052',
          // Legacy orange support
          orange: '#E4572E',
          'orange-light': '#FF8C61',
          'orange-dark': '#C94A26',
        },
        dgen1: {
          bg: '#0A0A0A', // Deep black background
          surface: '#121212', // Slightly lighter for cards
          'surface-hover': '#1A1A1A',
          border: '#1F1F1F',
          text: '#FFFFFF',
          'text-muted': '#888888',
          'text-dim': '#555555',
        },
        text: {
          primary: '#1E1E1E',
        },
        bg: {
          base: '#FAFAFA',
        },
        amber: {
          warning: '#E1A31E',
        },
      },
      boxShadow: {
        'glow-orange': '0 0 20px rgba(228, 87, 46, 0.3)',
        'glow-orange-lg': '0 0 30px rgba(228, 87, 46, 0.4)',
        'glow-primary': '0 0 20px rgba(0, 255, 136, 0.4)',
        'glow-primary-lg': '0 0 30px rgba(0, 255, 136, 0.6)',
        'glow-secondary': '0 0 20px rgba(0, 102, 255, 0.4)',
        'glow-accent': '0 0 20px rgba(255, 0, 102, 0.4)',
        'card': '0 2px 8px rgba(0, 0, 0, 0.04)',
        'card-hover': '0 4px 16px rgba(0, 0, 0, 0.08)',
        'card-lg': '0 4px 12px rgba(0, 0, 0, 0.06)',
        'dgen1-card': '0 4px 16px rgba(0, 0, 0, 0.6), 0 0 1px rgba(255, 255, 255, 0.1)',
        'dgen1-card-hover': '0 8px 24px rgba(0, 0, 0, 0.8), 0 0 2px rgba(0, 255, 136, 0.2)',
      },
    },
  },
  plugins: [],
};
export default config;

