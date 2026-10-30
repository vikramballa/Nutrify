import { Alert, Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';

export function SearchBar({
  value,
  onChangeText,
  onSubmit,
}: {
  value: string;
  onChangeText: (t: string) => void;
  onSubmit: () => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View
        style={{
          flex: 1,
          height: 52,
          backgroundColor: colors.surface,
          borderRadius: 16,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          gap: 10,
        }}
      >
        <Ionicons name="search" size={20} color={colors.textSecondary} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          returnKeyType="search"
          maxLength={100} // the API's MAX_QUERY_LEN
          placeholder="Search recipes or describe what you want to cook..."
          placeholderTextColor={colors.textTertiary}
          style={{ flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.textPrimary }}
        />
      </View>
      <Pressable
        onPress={() => Alert.alert('Filters', 'Coming soon')}
        style={{
          width: 52,
          height: 52,
          borderRadius: 16,
          backgroundColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="options-outline" size={22} color={colors.primary} />
      </Pressable>
    </View>
  );
}
