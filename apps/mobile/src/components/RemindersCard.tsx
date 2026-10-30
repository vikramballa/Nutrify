import { useState } from 'react';
import { Alert, Linking, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { radii, type } from '../theme/typography';
import { Card } from './Card';
import { useReminders } from '../hooks/useReminders';

/**
 * One switch, no per-meal knobs. The times are learned from the user's own
 * logs, so there is nothing useful for them to configure — and every extra
 * toggle is another decision between them and the habit.
 */
export function RemindersCard() {
  const { enabled, ready, toggle } = useReminders();
  const [busy, setBusy] = useState(false);

  async function onToggle(next: boolean) {
    setBusy(true);
    const result = await toggle(next);
    setBusy(false);
    // Asked for on, got off: the OS denied permission and only Settings can
    // undo that — saying so beats a switch that silently springs back.
    if (next && !result) {
      Alert.alert(
        'Notifications are off',
        'Turn them on for NutriChef in your device settings to get meal reminders.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open settings', onPress: () => void Linking.openSettings() },
        ],
      );
    }
  }

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={styles.icon}>
          <Ionicons name="notifications-outline" size={19} color={colors.primary} />
        </View>
        <View style={styles.text}>
          <Text style={type.cardTitle}>Meal reminders</Text>
          <Text style={[type.caption, styles.hint]}>
            {enabled
              ? 'Timed to when you actually eat, plus a Sunday recap.'
              : 'A quiet nudge at meal times so a day never goes unlogged.'}
          </Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          disabled={!ready || busy}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#FFFFFF"
          ios_backgroundColor={colors.border}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
  hint: { marginTop: 3 },
});
