/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Stitch Signature Green & Emerald Tones
        "forest-deep": "#064e3b",
        "primary": "#004532",
        "primary-container": "#065f46",
        "primary-fixed": "#a6f2d1",
        "primary-fixed-dim": "#8bd6b6",
        "on-primary": "#ffffff",
        "on-primary-container": "#8bd6b7",
        "on-primary-fixed": "#002116",
        "on-primary-fixed-variant": "#00513b",
        "emerald-brand": "#059669",
        "emerald-dark": "#064e3b",
        "emerald-light": "#ecfdf5",

        // Sage Soft & Gentle Canvas
        "sage-soft": "#e6f4ea",
        "sage-border": "#a7f3d0",
        "canvas-slate": "#f8fafc",
        "surface": "#faf8ff",
        "surface-bright": "#faf8ff",
        "surface-dim": "#d2d9f4",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#f2f3ff",
        "surface-container": "#eaedff",
        "surface-container-high": "#e2e7ff",
        "surface-container-highest": "#dae2fd",
        "surface-variant": "#dae2fd",
        "surface-tint": "#1b6b51",

        // Amber & Warm Accents
        "amber-soft": "#fef3c7",
        "amber-rich": "#b45309",
        "tertiary": "#5e3000",
        "tertiary-container": "#804300",
        "tertiary-fixed": "#ffdcc3",
        "tertiary-fixed-dim": "#ffb77d",
        "on-tertiary": "#ffffff",
        "on-tertiary-container": "#ffb87e",
        "on-tertiary-fixed": "#2f1500",
        "on-tertiary-fixed-variant": "#6e3900",

        // Secondary & Teal Accents
        "secondary": "#006c4a",
        "secondary-container": "#82f5c1",
        "secondary-fixed": "#85f8c4",
        "secondary-fixed-dim": "#68dba9",
        "on-secondary": "#ffffff",
        "on-secondary-container": "#00714e",
        "on-secondary-fixed": "#002114",
        "on-secondary-fixed-variant": "#005137",

        // Typography & Outlines
        "on-surface": "#131b2e",
        "on-surface-variant": "#3f4944",
        "on-background": "#131b2e",
        "outline": "#6f7973",
        "outline-variant": "#bec9c2",
        "border-subtle": "#e2e8f0",

        // Alerts & Errors
        "error": "#ba1a1a",
        "error-container": "#ffdad6",
        "on-error": "#ffffff",
        "on-error-container": "#93000a",
        "inverse-surface": "#283044",
        "inverse-on-surface": "#eef0ff",
        "inverse-primary": "#8bd6b6",

        // Backward compatibility brand tokens
        brand: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          500: '#0284c7',
          600: '#0284c7',
          700: '#0369a1',
          900: '#0c4a6e',
        },
        sci: {
          gold: '#f59e0b',
          emerald: '#10b981',
          ruby: '#ef4444',
          violet: '#8b5cf6',
          slate: '#0f172a',
        }
      },
      borderRadius: {
        "DEFAULT": "1rem",
        "lg": "2rem",
        "xl": "3rem",
        "full": "9999px"
      },
      spacing: {
        "space-xs": "0.5rem",
        "space-sm": "0.75rem",
        "space-md": "1.25rem",
        "space-lg": "2rem",
        "space-xl": "3rem",
        "gutter": "1.5rem",
        "gutter-mobile": "1rem",
        "margin": "3rem",
        "margin-mobile": "1.25rem"
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        "display-lg": ["Plus Jakarta Sans", "Outfit", "sans-serif"],
        "headline-lg": ["Plus Jakarta Sans", "Outfit", "sans-serif"],
        "headline-md": ["Plus Jakarta Sans", "Outfit", "sans-serif"],
        "headline-sm": ["Plus Jakarta Sans", "Outfit", "sans-serif"],
        "body-xl": ["Inter", "sans-serif"],
        "body-lg": ["Inter", "sans-serif"],
        "body-md": ["Inter", "sans-serif"],
        "label-lg": ["Inter", "sans-serif"],
        "label-md": ["Inter", "sans-serif"],
        "label-sm": ["Inter", "sans-serif"]
      },
      fontSize: {
        "display-lg": ["2.5rem", { lineHeight: "3rem", letterSpacing: "-0.02em", fontWeight: "700" }],
        "headline-lg": ["2rem", { lineHeight: "2.5rem", letterSpacing: "-0.01em", fontWeight: "600" }],
        "headline-md": ["1.5rem", { lineHeight: "2rem", fontWeight: "600" }],
        "headline-sm": ["1.25rem", { lineHeight: "1.75rem", fontWeight: "600" }],
        "body-xl": ["1.125rem", { lineHeight: "1.875rem", fontWeight: "400" }],
        "body-lg": ["1rem", { lineHeight: "1.625rem", fontWeight: "400" }],
        "body-md": ["0.9375rem", { lineHeight: "1.5rem", fontWeight: "400" }],
        "label-lg": ["1.0625rem", { lineHeight: "1.5rem", fontWeight: "600" }],
        "label-md": ["0.9375rem", { lineHeight: "1.375rem", fontWeight: "600" }],
        "label-sm": ["0.875rem", { lineHeight: "1.25rem", fontWeight: "600" }]
      }
    },
  },
  plugins: [],
}
