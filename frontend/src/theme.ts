// BeatCam Studio design tokens (from /app/design_guidelines.json)

export const colors = {
  surface: "#0D0E12",
  onSurface: "#F0F0F2",
  surfaceSecondary: "#1A1C23",
  onSurfaceSecondary: "#E0E1E5",
  surfaceTertiary: "#272A35",
  onSurfaceTertiary: "#D1D3D9",
  surfaceInverse: "#F0F0F2",
  onSurfaceInverse: "#0D0E12",
  brand: "#E62E3B",
  brandPrimary: "#FF3B4A",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#FF7A84",
  brandTertiary: "#3D1B1E",
  onBrandTertiary: "#FFD6D9",
  success: "#16B364",
  warning: "#F5A623",
  error: "#FA3A45",
  info: "#8F95B2",
  border: "#2A2D35",
  borderStrong: "#3D414D",
  divider: "#20232B",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
};

export const font = {
  display: "Barlow-Bold",
  displaySemi: "Barlow-SemiBold",
  displayReg: "Barlow-Regular",
  body: "DMSans-Regular",
  bodyMed: "DMSans-Medium",
  bodyBold: "DMSans-Bold",
};

export const fmtTime = (s: number): string => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};
