import { Text, View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { colors } from '../theme/colors';
import { fonts, radii } from '../theme/typography';

// Bowl + sprout mark, drawn once in a 48×48 grid so it stays crisp at any size.
const BOWL = 'M9 25.5 H39 C39 33.7 32.3 40.5 24 40.5 C15.7 40.5 9 33.7 9 25.5 Z';
const RIM = 'M7.5 21.5 H40.5 A2.2 2.2 0 0 1 40.5 25.9 H7.5 A2.2 2.2 0 0 1 7.5 21.5 Z';
const LEAF_RIGHT = 'M24.8 19.8 C24.8 12.6 29.6 7.5 36.5 6.6 C37.2 13.8 32.4 19.2 24.8 19.8 Z';
const LEAF_LEFT = 'M22.4 19.8 C22.4 14.8 19.2 11.1 13.9 10.3 C13.3 15.6 16.6 19.2 22.4 19.8 Z';

type LogoProps = {
  /** Outer tile size in px. */
  size?: number;
  /** `tile` = gradient badge (auth screens). `plain` = coral glyph on transparent. */
  variant?: 'tile' | 'plain';
  style?: ViewStyle;
};

export function Logo({ size = 72, variant = 'tile', style }: LogoProps) {
  const tile = variant === 'tile';
  const glyph = tile ? '#FFFFFF' : colors.primary;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="NutriChef logo"
      style={[
        {
          width: size,
          height: size,
          borderRadius: size * 0.31, // squircle-ish, softer than the inner shapes
          overflow: 'hidden',
        },
        tile && {
          shadowColor: colors.primaryDark,
          shadowOpacity: 0.32,
          shadowRadius: size * 0.22,
          shadowOffset: { width: 0, height: size * 0.11 },
          elevation: 6,
        },
        style,
      ]}
    >
      <Svg width={size} height={size} viewBox="0 0 48 48">
        {tile && (
          <>
            <Defs>
              <LinearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#FF9A5E" />
                <Stop offset="1" stopColor={colors.primaryDark} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="48" height="48" rx="15" fill="url(#brand)" />
            {/* Soft top-left sheen so the badge reads as lit from one direction. */}
            <Path d="M0 0 H48 L0 34 Z" fill="#FFFFFF" opacity={0.12} />
          </>
        )}
        <Path d={LEAF_LEFT} fill={glyph} opacity={tile ? 0.72 : 0.55} />
        <Path d={LEAF_RIGHT} fill={glyph} />
        <Path d={RIM} fill={glyph} />
        <Path d={BOWL} fill={glyph} opacity={tile ? 0.92 : 0.85} />
      </Svg>
    </View>
  );
}

/** Full lockup: mark + wordmark, used on the auth screens. */
export function LogoLockup({ size = 72 }: { size?: number }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Logo size={size} />
      <View style={{ flexDirection: 'row', marginTop: 14 }}>
        <Text
          style={{
            fontFamily: fonts.medium,
            fontSize: 22,
            letterSpacing: -0.3,
            color: colors.textPrimary,
          }}
        >
          Nutri
        </Text>
        <Text
          style={{
            fontFamily: fonts.bold,
            fontSize: 22,
            letterSpacing: -0.3,
            color: colors.primary,
          }}
        >
          Chef
        </Text>
      </View>
    </View>
  );
}

/** Small circular avatar for assistant chat bubbles. */
export function LogoAvatar({ size = 30 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radii.pill,
        backgroundColor: colors.primaryLight,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Logo size={size * 0.68} variant="plain" />
    </View>
  );
}
