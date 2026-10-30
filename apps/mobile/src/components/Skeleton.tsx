import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  View,
  type DimensionValue,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme/colors';
import { easing } from '../theme/motion';

const SWEEP_MS = 1250;

/**
 * Loading placeholder with a highlight sweeping across it. The sweep reads as
 * "still working" in a way a static block does not, and it travels on the
 * native driver so it keeps moving while the JS thread parses the response.
 */
export function Skeleton({
  width,
  height,
  borderRadius = 8,
  style,
}: {
  width: DimensionValue;
  height: DimensionValue;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  // The sweep has to travel the block's real pixel width, which percentage
  // widths only reveal after layout.
  const [measured, setMeasured] = useState(0);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: SWEEP_MS,
        easing: easing.standard,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  const onLayout = (e: LayoutChangeEvent) => setMeasured(e.nativeEvent.layout.width);

  return (
    <View
      onLayout={onLayout}
      style={[styles.base, { width, height, borderRadius }, style]}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
    >
      {measured > 0 && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              transform: [
                {
                  translateX: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-measured, measured],
                  }),
                },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={['transparent', colors.surface, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[StyleSheet.absoluteFill, styles.sweep]}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  sweep: { opacity: 0.7 },
});
