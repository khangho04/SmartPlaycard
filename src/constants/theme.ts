export const Brand = {
  primary: '#4F7CFF',
  primaryDark: '#1B2A4A',
  secondary: '#7C5CFF',
  accent: '#00D4AA',
  warning: '#FFB020',
  danger: '#FF5C5C',
  cardGradientStart: '#2B3F6E',
  cardGradientEnd: '#1B2A4A',
} as const;

export const Colors = {
  light: {
    text: '#0F172A',
    textSecondary: '#64748B',
    background: '#F4F7FB',
    surface: '#FFFFFF',
    border: '#E2E8F0',
    tint: Brand.primary,
  },
  dark: {
    text: '#F8FAFC',
    textSecondary: '#94A3B8',
    background: '#0B1220',
    surface: '#111B2E',
    border: '#1E293B',
    tint: Brand.primary,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const Radius = {
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
} as const;
