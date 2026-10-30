import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { fonts, type } from '../theme/typography';

const centered = {
  flex: 1,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  padding: 40,
  gap: 12,
};

/** Large orange spinner + "Generating recipe..." (AI generation in flight). */
export function GeneratingIndicator() {
  return (
    <View style={centered}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[type.body, { color: colors.textSecondary }]}>Generating recipe...</Text>
    </View>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <View style={centered}>
      <Text style={[type.body, { color: colors.textSecondary, textAlign: 'center' }]}>
        {message}
      </Text>
    </View>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={centered}>
      <Text style={[type.body, { color: colors.textSecondary }]}>Something went wrong</Text>
      <Pressable onPress={onRetry}>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.primary }}>
          Retry
        </Text>
      </Pressable>
    </View>
  );
}
