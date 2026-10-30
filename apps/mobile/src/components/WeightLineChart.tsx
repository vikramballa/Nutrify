import { useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import type { WeightEntry } from '@nutrichef/shared';
import { colors } from '../theme/colors';
import { type } from '../theme/typography';

const HEIGHT = 160;
const PAD = 16;

/**
 * Hand-rolled weight line chart (react-native-svg): entries oldest..latest,
 * evenly spaced. Width comes from the parent via onLayout.
 */
export function WeightLineChart({ entries }: { entries: WeightEntry[] }) {
  const [width, setWidth] = useState(0);
  if (entries.length === 0) return null;

  const kgs = entries.map((e) => e.kg);
  let min = Math.min(...kgs);
  let max = Math.max(...kgs);
  if (max - min < 1) {
    min -= 0.5;
    max += 0.5;
  }
  const x = (i: number) =>
    PAD + (width - 2 * PAD) * (entries.length === 1 ? 0.5 : i / (entries.length - 1));
  const y = (kg: number) => PAD + (HEIGHT - 2 * PAD) * (1 - (kg - min) / (max - min));
  const points = entries.map((e, i) => `${x(i)},${y(e.kg)}`).join(' ');
  const dateLabel = (key: string) => {
    const d = new Date(`${key}T00:00:00Z`);
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  };

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <View style={{ gap: 6 }}>
          <Svg width={width} height={HEIGHT}>
            {entries.length > 1 && (
              <Polyline points={points} fill="none" stroke={colors.primary} strokeWidth={2} />
            )}
            {entries.map((e, i) => (
              <Circle key={e.id} cx={x(i)} cy={y(e.kg)} r={4} fill={colors.primary} />
            ))}
          </Svg>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={type.caption}>{dateLabel(entries[0].date)}</Text>
            <Text style={type.caption}>
              {Math.min(...kgs).toFixed(1)}–{Math.max(...kgs).toFixed(1)} kg
            </Text>
            <Text style={type.caption}>{dateLabel(entries[entries.length - 1].date)}</Text>
          </View>
        </View>
      )}
    </View>
  );
}
