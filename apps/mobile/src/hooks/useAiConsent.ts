import { Alert, Linking } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { PRIVACY_URL } from '../api/client';

// Keep in step with AI_PROVIDER_ORDER on the server; the privacy policy lists
// the configured providers by name automatically.
const AI_PROVIDER = 'Ollama';

export const AI_CONSENT_MESSAGE =
  `To do this, NutriChef sends your photo or message to ${AI_PROVIDER}, a third-party ` +
  'AI service, along with a short summary of your profile: age, sex, height, weight, ' +
  'goal and any medical conditions you added.\n\n' +
  'Nothing is sent until you allow it, and you can turn this off at any time in Settings.';

/**
 * App Store 5.1.2(i): explicit permission before personal data reaches a
 * third-party AI. `ensure()` asks once, remembers the answer on the server,
 * and resolves true only when the feature may go ahead.
 */
export function useAiConsent() {
  const { user, setAiConsent } = useAuth();
  const granted = user?.aiConsent ?? false;

  function ensure(): Promise<boolean> {
    if (granted) return Promise.resolve(true);
    return new Promise((resolve) => {
      Alert.alert(
        'Use AI features?',
        AI_CONSENT_MESSAGE,
        [
          { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
          {
            text: 'Privacy Policy',
            onPress: () => {
              void Linking.openURL(PRIVACY_URL);
              resolve(false);
            },
          },
          {
            text: 'Allow',
            onPress: () =>
              setAiConsent(true).then(
                () => resolve(true),
                () => {
                  Alert.alert('Could not save', 'Check your connection and try again.');
                  resolve(false);
                },
              ),
          },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      );
    });
  }

  return { granted, ensure };
}
