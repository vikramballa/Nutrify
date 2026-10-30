import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { AuthField } from '../components/AuthField';
import { LogoLockup } from '../components/Logo';
import { colors } from '../theme/colors';
import { fonts, radii, SCREEN_PADDING } from '../theme/typography';
import { FadeIn, PopIn, PressableScale } from '../theme/motion';
import { useAuth } from '../auth/AuthContext';
import { PRIVACY_URL, TERMS_URL, type ApiError } from '../api/client';
import type { RootStackParamList } from '../navigation/types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function messageFor(err: unknown): string {
  const apiErr = err as ApiError;
  // Server-provided message (email taken, validation, rate limited…).
  if (apiErr?.status && apiErr.message) return apiErr.message;
  return 'Could not create your account. Check your connection and try again.';
}

export function SignUpScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function validate(): string | null {
    if (!name.trim()) return 'Please enter your name.';
    if (!EMAIL_RE.test(email.trim())) return 'Please enter a valid email address.';
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (password !== confirm) return 'Passwords do not match.';
    return null;
  }

  async function submit() {
    if (busy) return;
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      // On success the session is set, and the auth gate switches to the app.
      await register(email.trim(), password, name.trim());
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: SCREEN_PADDING }}
          keyboardShouldPersistTaps="handled"
        >
          <PopIn style={{ alignItems: 'center', marginBottom: 28 }}>
            <LogoLockup size={68} />
            <Text
              style={{
                fontFamily: fonts.bold,
                fontSize: 28,
                letterSpacing: -0.6,
                color: colors.textPrimary,
                marginTop: 24,
              }}
            >
              Create account
            </Text>
            <Text
              style={{ fontFamily: fonts.regular, fontSize: 14, color: colors.textSecondary, marginTop: 4 }}
            >
              Start planning meals in seconds
            </Text>
          </PopIn>

          <FadeIn delay={140}>
          <AuthField
            icon="person-outline"
            placeholder="Name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
          <AuthField
            icon="mail-outline"
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <AuthField
            icon="lock-closed-outline"
            placeholder="Password (min 8 characters)"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />
          <AuthField
            icon="lock-closed-outline"
            placeholder="Confirm password"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoCapitalize="none"
            onSubmitEditing={submit}
            returnKeyType="go"
          />

          {error && (
            <View
              style={{
                backgroundColor: colors.dangerLight,
                borderRadius: radii.md,
                paddingHorizontal: 12,
                paddingVertical: 10,
                marginBottom: 14,
              }}
            >
              <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.danger }}>
                {error}
              </Text>
            </View>
          )}

          <PressableScale
            onPress={submit}
            haptic
            scaleTo={0.98}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Create account"
            style={{
              height: 54,
              borderRadius: radii.md,
              backgroundColor: busy ? colors.textTertiary : colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: colors.primaryDark,
              shadowOpacity: busy ? 0 : 0.3,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 6 },
              elevation: busy ? 0 : 4,
            }}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: '#fff' }}>
                Create account
              </Text>
            )}
          </PressableScale>

          <Text
            style={{
              marginTop: 14,
              textAlign: 'center',
              fontFamily: fonts.regular,
              fontSize: 12,
              color: colors.textTertiary,
            }}
          >
            By creating an account you agree to our{' '}
            <Text style={{ color: colors.primary }} onPress={() => void Linking.openURL(TERMS_URL)}>
              Terms of Use
            </Text>{' '}
            and{' '}
            <Text style={{ color: colors.primary }} onPress={() => void Linking.openURL(PRIVACY_URL)}>
              Privacy Policy
            </Text>
            .
          </Text>

          <PressableScale
            onPress={() => nav.goBack()}
            scaleTo={0.98}
            style={{ marginTop: 22, alignItems: 'center' }}
          >
            <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: colors.textSecondary }}>
              Already have an account?{' '}
              <Text style={{ color: colors.primary, fontFamily: fonts.semibold }}>Sign in</Text>
            </Text>
          </PressableScale>
          </FadeIn>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
