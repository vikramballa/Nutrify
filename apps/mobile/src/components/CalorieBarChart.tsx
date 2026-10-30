import { useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import type { ProgressDay } from '@nutrichef/shared';
import { colors } from '../theme/colors';
import { type } from '../theme/typography';

const HEIGHT = 160;
const TOP_PAD = 10;
const BOTTOM_PAD = 4;
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Hand-rolled weekly calorie bar chart (react-native-svg): one bar per day,
 * dashed line at the calorie goal. Width comes from the parent via onLayout.
 */
export function CalorieBarChart({
  days,
  goal,
}: {
  days: ProgressDay[];
  goal: number | null;
}) {
  const [width, setWidth] = useState(0);
  if (days.length === 0) return null;

  const maxVal = Math.max(goal ?? 0, ...days.map((d) => d.calories), 1) * 1.1; // 10% headroom
  const chartH = HEIGHT - TOP_PAD - BOTTOM_PAD;
  const y = (v: number) => TOP_PAD + chartH * (1 - v / maxVal);
  const slot = width / days.length;
  const barW = Math.min(28, slot * 0.55);

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <View style={{ gap: 6 }}>
          <Svg width={width} height={HEIGHT}>
            {goal != null && goal > 0 && (
              <Line
                x1={0}
                x2={width}
                y1={y(goal)}
                y2={y(goal)}
                stroke={colors.textTertiary}
                strokeWidth={1}
                strokeDasharray="6 4"
              />
            )}
            {days.map((d, i) => {
              const h = Math.max(2, y(0) - y(d.calories));
              return (
                <Rect
                  key={d.date}
                  x={slot * i + (slot - barW) / 2}
                  y={y(0) - h}
                  width={barW}
                  height={h}
                  rx={6}
                  fill={d.calories > 0 ? colors.primary : colors.primaryLight}
                />
              );
            })}
          </Svg>
          <View style={{ flexDirection: 'row' }}>
            {days.map((d) => (
              <Text key={d.date} style={[type.caption, { flex: 1, textAlign: 'center' }]}>
                {DAY_LETTERS[new Date(`${d.date}T00:00:00Z`).getUTCDay()]}
              </Text>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}
