/**
 * Design tokens. Change brand colours here; components read only from the
 * active palette via `useTheme()`. Text/background pairs meet WCAG AA contrast.
 */
const palette = {
  light: {
    background: '#F6F7FB',
    surface: '#FFFFFF',
    surfaceMuted: '#EEF1F6',
    border: '#D5DAE3',
    text: '#111827',
    textMuted: '#4B5563',
    primary: '#1D4ED8',
    primaryPressed: '#1E40AF',
    onPrimary: '#FFFFFF',
    primarySoft: '#DBEAFE',
    danger: '#B91C1C',
    dangerSoft: '#FEE2E2',
    success: '#047857',
    successSoft: '#D1FAE5',
    warning: '#92400E',
    warningSoft: '#FEF3C7',
  },
  dark: {
    background: '#0B1120',
    surface: '#111827',
    surfaceMuted: '#1F2937',
    border: '#374151',
    text: '#F9FAFB',
    textMuted: '#C2C8D2',
    primary: '#93C5FD',
    primaryPressed: '#BFDBFE',
    onPrimary: '#0B1120',
    primarySoft: '#1E3A8A',
    danger: '#FCA5A5',
    dangerSoft: '#450A0A',
    success: '#6EE7B7',
    successSoft: '#064E3B',
    warning: '#FCD34D',
    warningSoft: '#451A03',
  },
} as const;

export type ColorScheme = keyof typeof palette;
export type ThemeColors = { [K in keyof (typeof palette)['light']]: string };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radii = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export const typography = {
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  subheading: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  label: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
} as const;

/** Minimum touch target (iOS HIG 44pt, Material 48dp). */
export const MIN_TOUCH_TARGET = 48;
export const MAX_CONTENT_WIDTH = 640;

export interface Theme {
  scheme: ColorScheme;
  colors: ThemeColors;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
}

export function getTheme(scheme: ColorScheme): Theme {
  return { scheme, colors: palette[scheme], spacing, radii, typography };
}
