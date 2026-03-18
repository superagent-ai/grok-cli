export const dark = {
  background: "#0a0a0a",
  backgroundPanel: "#141414",
  backgroundElement: "#1e1e1e",
  border: "#484848",
  borderActive: "#606060",
  borderSubtle: "#3c3c3c",
  text: "#eeeeee",
  textMuted: "#808080",
  primary: "#fab283",
  secondary: "#5c9cf5",
  accent: "#9d7cd8",
  error: "#e06c75",
  warning: "#f5a742",
  success: "#7fd88f",
  info: "#56b6c2",
} as const;

export type Theme = typeof dark;
