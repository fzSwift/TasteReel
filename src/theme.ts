import { StyleSheet } from "react-native";

export const colors = {
  bg: "#0a0a0c",
  bgElevated: "#121218",
  surface: "#1a1a22",
  surface2: "#22222e",
  border: "#2a2a38",
  borderLight: "#3d3d4d",
  text: "#f4f4f8",
  textMuted: "#9898a8",
  textSubtle: "#6c6c7c",
  accent: "#ff5c3d",
  accentMuted: "#c94a32",
  accentGlow: "rgba(255, 92, 61, 0.15)",
  success: "#3dd68c",
  successMuted: "rgba(61, 214, 140, 0.15)",
  warning: "#f5a524",
  warningMuted: "rgba(245, 165, 36, 0.18)",
  error: "#ff6b6b",
  errorMuted: "rgba(255, 107, 107, 0.12)",
  demo: "#7c7cf8",
  demoMuted: "rgba(124, 124, 248, 0.15)",
  overlay: "rgba(8, 8, 12, 0.72)",
};

export const radius = { sm: 8, md: 14, lg: 20, xl: 28 };

export const spacing = { xs: 6, sm: 10, md: 16, lg: 22, xl: 28 };

export const typography = StyleSheet.create({
  hero: { fontSize: 28, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: "700", color: colors.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 15, fontWeight: "500", color: colors.textMuted, lineHeight: 22 },
  label: { fontSize: 12, fontWeight: "700", color: colors.textSubtle, letterSpacing: 0.6, textTransform: "uppercase" },
  body: { fontSize: 15, color: colors.text, lineHeight: 22 },
  small: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  price: { fontSize: 18, fontWeight: "800", color: colors.text },
});
