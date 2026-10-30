import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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
import type { ApiError } from '../api/client';
import type { RootStackParamList } from '../navigation/types';

function messageFor(err: unknown): string {
  const apiErr = err as ApiError;
  // Server-provided message (invalid credentials, rate limited, validation…).
  if (apiErr?.status && apiErr.message) return apiErr.message;
  return 'Could not sign in. Check your connection and try again.';
}

export function LoginScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
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
        style={{ flex: 1, justifyContent: 'center', padding: SCREEN_PADDING }}
      >
        <PopIn style={{ alignItems: 'center', marginBottom: 32 }}>
          <LogoLockup size={76} />
          <Text
            style={{
              fontFamily: fonts.bold,
              fontSize: 28,
              letterSpacing: -0.6,
              color: colors.textPrimary,
              marginTop: 26,
            }}
          >
            Welcome back
          </Text>
          <Text
            style={{ fontFamily: fonts.regular, fontSize: 14, color: colors.textSecondary, marginTop: 4 }}
          >
            Sign in to continue to NutriChef
          </Text>
        </PopIn>

        <FadeIn delay={140}>
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
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
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
          accessibilityLabel="Sign in"
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
            <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: '#fff' }}>Sign in</Text>
          )}
        </PressableScale>

        <PressableScale
          onPress={() => nav.navigate('SignUp')}
          scaleTo={0.98}
          style={{ marginTop: 22, alignItems: 'center' }}
        >
          <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: colors.textSecondary }}>
            New to NutriChef?{' '}
            <Text style={{ color: colors.primary, fontFamily: fonts.semibold }}>Create an account</Text>
          </Text>
        </PressableScale>
        </FadeIn>
      </KeyboardAvoidingView>
    </Screen>
  );
}
