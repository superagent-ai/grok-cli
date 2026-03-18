export const dark = {
  background: "#000000",
  backgroundPanel: "#111111",
  backgroundElement: "#1a1a1a",
  border: "#333333",
  borderActive: "#555555",
  text: "#e0e0e0",
  textMuted: "#666666",
  textDim: "#444444",
  primary: "#ffffff",
  accent: "#5c9cf5",
  selected: "#ffffff",
  selectedBg: "#2a2a2a",
} as const;

export type Theme = typeof dark;
