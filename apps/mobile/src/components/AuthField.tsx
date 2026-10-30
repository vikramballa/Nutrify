import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  /** Unit shown after a filled value ("cm"): the placeholder that named the
   *  field disappears once it has a value, leaving a bare "172". */
  suffix?: string;
} & React.ComponentProps<typeof TextInput>;

/** Rounded input with a leading icon; password fields get a show/hide toggle. */
export function AuthField({ icon, suffix, secureTextEntry, ...props }: Props) {
  const [hidden, setHidden] = useState(!!secureTextEntry);
  return (
    <View
      style={{
        height: 54,
        backgroundColor: colors.surface,
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        gap: 10,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Ionicons name={icon} size={20} color={colors.textSecondary} />
      <TextInput
        placeholderTextColor={colors.textTertiary}
        secureTextEntry={hidden}
        style={{ flex: 1, fontFamily: fonts.regular, fontSize: 15, color: colors.textPrimary }}
        accessibilityLabel={props.placeholder}
        {...props}
      />
      {suffix && props.value ? (
        <Text style={{ fontFamily: fonts.regular, fontSize: 15, color: colors.textSecondary }}>
          {suffix}
        </Text>
      ) : null}
      {secureTextEntry && (
        <Pressable onPress={() => setHidden((h) => !h)} hitSlop={8}>
          <Ionicons
            name={hidden ? 'eye-outline' : 'eye-off-outline'}
            size={20}
            color={colors.textSecondary}
          />
        </Pressable>
      )}
    </View>
  );
}
