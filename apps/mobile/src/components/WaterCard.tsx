import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { fonts, type } from '../theme/typography';
import { Card } from './Card';
import { ErrorState } from './States';
import { useAddWater, useWaterToday } from '../hooks/useTracking';

const TARGET_ML = 2000; // default daily target
const QUICK_ADDS = [250, 500];

/** Compact water tracker for the Home screen: today vs target + quick adds. */
export function WaterCard() {
  const today = useWaterToday();
  const add = useAddWater();

  const total = today.data?.totalMl ?? 0;
  const pct = Math.min(total / TARGET_ML, 1);

  return (
    <Card style={{ padding: 20, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="water" size={20} color={colors.primary} />
          <Text style={type.sectionHeader}>Water</Text>
        </View>
        <Text style={type.caption}>
          {total} / {TARGET_ML} ml
        </Text>
      </View>

      {today.isError ? (
        <ErrorState onRetry={() => today.refetch()} />
      ) : today.isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          <View
            style={{
              height: 10,
              borderRadius: 5,
              backgroundColor: colors.primaryLight,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: `${pct * 100}%`,
                height: '100%',
                borderRadius: 5,
                backgroundColor: colors.primary,
              }}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {QUICK_ADDS.map((ml) => (
              <Pressable
                key={ml}
                onPress={() => add.mutate(ml)}
                accessibilityRole="button"
                accessibilityLabel={`Add ${ml} ml of water`}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  paddingVertical: 10,
                  borderRadius: 12,
                  backgroundColor: colors.primaryLight,
                }}
              >
                <Ionicons name="add" size={16} color={colors.primary} />
                <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.primary }}>
                  {ml} ml
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </Card>
  );
}
