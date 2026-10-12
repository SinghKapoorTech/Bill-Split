export type Theme = {
  bg: string;
  ink: string;
  muted: string;
  accent: string;
  brand: string;
  // Highlight "**spans**" with a filled marker instead of coloured text.
  marker?: boolean;
  markerInk?: string;
  glow?: string;
  // Rotate the background per slide.
  cycle?: string[];
};

// Each post gets its own look so Meta's Andromeda treats them as distinct concepts.
export const THEMES: Record<string, Theme> = {
  // Brand light theme (src/index.css).
  cream: {
    bg: "hsl(40 30% 97%)",
    ink: "hsl(30 30% 12%)",
    muted: "hsl(30 12% 45%)",
    accent: "hsl(42 65% 40%)",
    brand: "hsl(42 65% 40%)",
    glow: "radial-gradient(circle at 70% 25%, hsl(42 70% 88%) 0%, transparent 55%)",
  },
  // Brand dark theme.
  night: {
    bg: "hsl(30 20% 9%)",
    ink: "hsl(38 30% 92%)",
    muted: "hsl(30 10% 62%)",
    accent: "hsl(42 60% 55%)",
    brand: "hsl(42 60% 55%)",
    glow: "radial-gradient(circle at 20% 15%, hsla(42, 60%, 40%, 0.35) 0%, transparent 50%)",
  },
  pop: {
    bg: "#ffd66b",
    ink: "#1d1a16",
    muted: "rgba(29,26,22,0.65)",
    accent: "#1d1a16",
    brand: "#1d1a16",
    marker: true,
    markerInk: "#ffd66b",
    cycle: ["#ffd66b", "#ffb4a2", "#b8e0d2", "#c9b6f2", "#a7c7e7", "#f7c59f", "#ffd66b"],
  },
  hot: {
    bg: "#d6453d",
    ink: "#ffffff",
    muted: "rgba(255,255,255,0.78)",
    accent: "#ffe08a",
    brand: "#ffffff",
    marker: true,
    markerInk: "#1d1a16",
  },
};
