import { TextStyle, ViewStyle } from 'react-native';
import { colors } from './colors';

export const fonts = {
  regular: 'Quicksand_400Regular',
  medium: 'Quicksand_500Medium',
  semibold: 'Quicksand_600SemiBold',
  bold: 'Quicksand_700Bold',
};

export const type: Record<string, TextStyle> = {
  screenTitle: {
    fontFamily: fonts.bold,
    fontSize: 29,
    lineHeight: 34,
    letterSpacing: -0.6,
    color: colors.textPrimary,
  },
  sectionHeader: {
    fontFamily: fonts.semibold,
    fontSize: 18,
    letterSpacing: -0.2,
    color: colors.textPrimary,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: 17,
    letterSpacing: -0.2,
    color: colors.textPrimary,
  },
  body: { fontFamily: fonts.regular, fontSize: 14.5, lineHeight: 23, color: colors.textPrimary },
  caption: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.textSecondary },
  // Small label above a section — positive tracking keeps it legible at 11px.
  eyebrow: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    letterSpacing: 1.1,
    color: colors.textSecondary,
  },
  statNumber: {
    fontFamily: fonts.bold,
    fontSize: 21,
    letterSpacing: -0.4,
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
};

export const radii = { sm: 10, md: 14, lg: 20, xl: 26, pill: 999 };

export const cardStyle: ViewStyle = {
  backgroundColor: colors.surface,
  borderRadius: radii.lg,
  shadowColor: colors.shadow,
  shadowOpacity: 0.08,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
};

export const SCREEN_PADDING = 20;
