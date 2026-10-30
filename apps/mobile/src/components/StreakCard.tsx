import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { StreakSummary } from '@nutrichef/shared';
import { colors } from '../theme/colors';
import { fonts, radii, type } from '../theme/typography';
import { Counter } from '../theme/motion';
import { Skeleton } from '../components/Skeleton';

const DAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * The flame breathes only while the streak is alive, so the card is still
 * rather than animating at someone who has nothing to celebrate yet.
 */
function Flame({ active }: { active: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  return (
    <Animated.View
      style={[
        styles.flameWrap,
        active && {
          transform: [
            { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.09] }) },
          ],
        },
      ]}
    >
      <Ionicons
        name={active ? 'flame' : 'flame-outline'}
        size={26}
        color={active ? '#FFFFFF' : 'rgba(255,255,255,0.55)'}
      />
    </Animated.View>
  );
}

function DayDot({ day, index }: { day: StreakSummary['week'][number]; index: number }) {
  const today = new Date().toISOString().slice(0, 10);
  const isToday = day.date === today;
  const future = day.date > today;

  return (
    <View style={styles.dayColumn}>
      <View
        style={[
          styles.dot,
          day.logged && styles.dotFilled,
          isToday && !day.logged && styles.dotToday,
          future && styles.dotFuture,
        ]}
      >
        {day.logged && <Ionicons name="checkmark" size={12} color={colors.primary} />}
      </View>
      <Text style={[styles.dayLabel, isToday && styles.dayLabelToday]}>{DAY_INITIALS[index]}</Text>
    </View>
  );
}

/** What the number means, in one line the user can act on. */
function subtitle(streak: StreakSummary): string {
  if (streak.current === 0) return 'Log a meal to start your streak';
  if (streak.forgiving) return 'Rest day used — log today to keep it';
  if (!streak.loggedToday) return 'Log today to keep it going';
  if (streak.current === streak.longest && streak.current > 2) return 'Your best run yet';
  return `Best: ${streak.longest} day${streak.longest === 1 ? '' : 's'}`;
}

export function StreakCard({ streak, loading }: { streak?: StreakSummary; loading?: boolean }) {
  if (loading || !streak) return <Skeleton width="100%" height={132} borderRadius={radii.lg} />;

  const active = streak.current > 0;

  return (
    <LinearGradient
      colors={active ? ['#FF8A57', '#F2613B'] : ['#C9BDB5', '#AFA098']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <View style={styles.headerRow}>
        <Flame active={active} />
        <View style={styles.headerText}>
          <View style={styles.countRow}>
            <Counter value={streak.current} style={styles.count} />
            <Text style={styles.countUnit}>{streak.current === 1 ? 'day' : 'days'}</Text>
          </View>
          <Text style={styles.subtitle}>{subtitle(streak)}</Text>
        </View>
      </View>

      <View style={styles.week}>
        {streak.week.map((day, i) => (
          <DayDot key={day.date} day={day} index={i} />
        ))}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    padding: 18,
    gap: 16,
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  flameWrap: {
    width: 46,
    height: 46,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  countRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  count: {
    fontFamily: fonts.bold,
    fontSize: 30,
    letterSpacing: -0.8,
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  countUnit: { fontFamily: fonts.semibold, fontSize: 15, color: 'rgba(255,255,255,0.85)' },
  subtitle: {
    ...type.caption,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 1,
  },

  week: { flexDirection: 'row', justifyContent: 'space-between' },
  dayColumn: { alignItems: 'center', gap: 6 },
  dot: {
    width: 26,
    height: 26,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotFilled: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  dotToday: { borderColor: '#FFFFFF', borderStyle: 'dashed' },
  dotFuture: { borderColor: 'rgba(255,255,255,0.25)' },
  dayLabel: { fontFamily: fonts.medium, fontSize: 11, color: 'rgba(255,255,255,0.75)' },
  dayLabelToday: { fontFamily: fonts.bold, color: '#FFFFFF' },
});
