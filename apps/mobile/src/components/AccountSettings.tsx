import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { fonts, radii, type } from '../theme/typography';
import { Card } from './Card';
import { AuthField } from './AuthField';
import { useAuth } from '../auth/AuthContext';
import { useAiConsent } from '../hooks/useAiConsent';
import { PRIVACY_URL, TERMS_URL } from '../api/client';

/** The one switch for sharing data with the AI provider. */
export function AiFeaturesCard() {
  const { setAiConsent } = useAuth();
  const { granted, ensure } = useAiConsent();
  const [busy, setBusy] = useState(false);

  async function onToggle(next: boolean) {
    if (next) {
      setBusy(true);
      await ensure();
      setBusy(false);
      return;
    }
    Alert.alert(
      'Turn off AI features?',
      'The assistant, photo scanning, pantry ideas and the weekly coach will stop working. ' +
        'Nothing more will be sent to the AI provider.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Turn off',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await setAiConsent(false);
            } catch {
              Alert.alert('Could not save', 'Check your connection and try again.');
            }
            setBusy(false);
          },
        },
      ],
    );
  }

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={styles.icon}>
          <Ionicons name="sparkles-outline" size={19} color={colors.primary} />
        </View>
        <View style={styles.flex1}>
          <Text style={type.cardTitle}>AI features</Text>
          <Text style={[type.caption, styles.hint]}>
            {granted
              ? 'On. Your photos, messages and profile summary are sent to our AI provider when you use these features.'
              : 'Off. Turn on to use the assistant, photo scanning, pantry ideas and the weekly coach.'}
          </Text>
        </View>
        <Switch
          value={granted}
          onValueChange={onToggle}
          disabled={busy}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#FFFFFF"
          ios_backgroundColor={colors.border}
        />
      </View>
    </Card>
  );
}

function LinkRow({
  icon,
  label,
  onPress,
  color = colors.textPrimary,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  color?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.linkRow}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={19} color={color} />
      <Text style={[styles.linkLabel, { color }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={17} color={colors.textTertiary} />
    </Pressable>
  );
}

/** Legal links, sign out and in-app account deletion (App Store 5.1.1). */
export function AccountCard() {
  const { user, logout, deleteAccount } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function confirmDelete() {
    if (!password) {
      setError('Enter your password to confirm.');
      return;
    }
    Alert.alert(
      'Delete your account?',
      'Your profile, logs, meal plans, saved recipes and chat history will be permanently deleted. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void runDelete() },
      ],
    );
  }

  async function runDelete() {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(password);
      // The session is gone, so the navigator swaps to the login screen.
    } catch (err) {
      setError(
        (err as { status?: number }).status === 403
          ? 'That password is not right.'
          : 'Could not delete your account. Check your connection and try again.',
      );
      setBusy(false);
    }
  }

  return (
    <Card style={styles.card}>
      {user && <Text style={[type.caption, styles.signedIn]}>Signed in as {user.email}</Text>}
      <LinkRow
        icon="shield-checkmark-outline"
        label="Privacy Policy"
        onPress={() => void Linking.openURL(PRIVACY_URL)}
      />
      <LinkRow
        icon="document-text-outline"
        label="Terms of Use"
        onPress={() => void Linking.openURL(TERMS_URL)}
      />
      <LinkRow icon="log-out-outline" label="Sign out" onPress={() => void logout()} />
      <LinkRow
        icon="trash-outline"
        label="Delete account"
        color={colors.danger}
        onPress={() => {
          setDeleting((d) => !d);
          setError(null);
        }}
      />

      {deleting && (
        <View style={styles.deleteBox}>
          <Text style={type.caption}>
            This permanently deletes your account and all of your data. Enter your password to
            confirm.
          </Text>
          <AuthField
            icon="lock-closed-outline"
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password"
            returnKeyType="done"
            onSubmitEditing={confirmDelete}
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable
            onPress={confirmDelete}
            disabled={busy}
            style={[styles.deleteButton, busy && styles.deleteButtonBusy]}
            accessibilityRole="button"
            accessibilityLabel="Permanently delete account"
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.deleteLabel}>Permanently delete account</Text>
            )}
          </Pressable>
        </View>
      )}
    </Card>
  );
}

/** App Store 1.4.1: a health app must send people to a doctor for decisions. */
export function HealthNote() {
  return (
    <Text style={[type.caption, styles.note]}>
      NutriChef gives general nutrition information, not medical advice. Calorie and nutrient
      numbers are estimates. Check with your doctor before changing your diet, especially if you
      have a medical condition.
    </Text>
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
  flex1: { flex: 1 },
  hint: { marginTop: 3 },
  signedIn: { marginBottom: 4 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  linkLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 15 },
  deleteBox: { gap: 10, paddingTop: 8 },
  error: { fontFamily: fonts.medium, fontSize: 13, color: colors.danger },
  deleteButton: {
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonBusy: { opacity: 0.6 },
  deleteLabel: { fontFamily: fonts.semibold, fontSize: 15, color: '#fff' },
  note: { textAlign: 'center', paddingHorizontal: 8 },
});
