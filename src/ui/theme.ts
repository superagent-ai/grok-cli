export const dark = {
  background: "#000000",
  backgroundPanel: "#141414",
  backgroundElement: "#1e1e1e",
  border: "#484848",
  borderActive: "#606060",
  borderSubtle: "#3c3c3c",
  text: "#ffffff",
  textMuted: "#808080",
  primary: "#ffffff",
  secondary: "#808080",
  accent: "#ffffff",
  error: "#ffffff",
  warning: "#ffffff",
  success: "#ffffff",
  info: "#808080",
  selected: "#ffffff",
  selectedBg: "#3c3c3c",
} as const;

export type Theme = typeof dark;
