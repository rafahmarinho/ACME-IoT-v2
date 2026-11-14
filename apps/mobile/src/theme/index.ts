import { Platform } from 'react-native';

export const colors = {
  bg: '#F6F7FB',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F2F8',
  border: '#E4E6EF',
  borderStrong: '#CDD1DE',
  text: '#0F172A',
  textMuted: '#5B6478',
  textSubtle: '#8A92A6',
  primary: '#4F46E5',
  primaryDark: '#4338CA',
  primarySoft: '#EEF0FF',
  primaryBorder: '#C7CBFB',
  success: '#059669',
  successSoft: '#E7F7F0',
  warning: '#D97706',
  warningSoft: '#FEF4E2',
  danger: '#DC2626',
  dangerSoft: '#FDECEC',
  info: '#0284C7',
  infoSoft: '#E6F4FB',
  heat: '#EA580C',
  cool: '#2563EB',
  overlay: 'rgba(15, 23, 42, 0.45)',
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };
export const space = (n: number) => n * 4;

export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
};

export const shadow = Platform.select({
  web: { boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(15,23,42,0.05)' } as object,
  default: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
});

export const type = {
  h1: { fontFamily: font.bold, fontSize: 26, lineHeight: 32, color: colors.text, letterSpacing: -0.4 },
  h2: { fontFamily: font.semibold, fontSize: 19, lineHeight: 26, color: colors.text, letterSpacing: -0.2 },
  h3: { fontFamily: font.semibold, fontSize: 16, lineHeight: 22, color: colors.text },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: colors.text },
  small: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: colors.textMuted },
  label: { fontFamily: font.medium, fontSize: 13, lineHeight: 18, color: colors.textMuted },
  caption: { fontFamily: font.medium, fontSize: 11, lineHeight: 14, color: colors.textSubtle, letterSpacing: 0.4, textTransform: 'uppercase' as const },
  metric: { fontFamily: font.bold, fontSize: 28, lineHeight: 34, color: colors.text, letterSpacing: -0.6 },
};
