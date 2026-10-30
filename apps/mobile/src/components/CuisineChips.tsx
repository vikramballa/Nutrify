import { Pressable, ScrollView, Text } from 'react-native';
import { colors } from '../theme/colors';
import { fonts, SCREEN_PADDING } from '../theme/typography';

const EMOJI: Record<string, string> = {
  American: '🇺🇸',
  British: '🇬🇧',
  Canadian: '🇨🇦',
  Chinese: '🇨🇳',
  Croatian: '🇭🇷',
  Dutch: '🇳🇱',
  Egyptian: '🇪🇬',
  Filipino: '🇵🇭',
  French: '🇫🇷',
  Greek: '🇬🇷',
  Indian: '🇮🇳',
  Irish: '🇮🇪',
  Italian: '🇮🇹',
  Jamaican: '🇯🇲',
  Japanese: '🇯🇵',
  Kenyan: '🇰🇪',
  Malaysian: '🇲🇾',
  Mexican: '🇲🇽',
  Moroccan: '🇲🇦',
  Polish: '🇵🇱',
  Portuguese: '🇵🇹',
  Russian: '🇷🇺',
  Spanish: '🇪🇸',
  Thai: '🇹🇭',
  Tunisian: '🇹🇳',
  Turkish: '🇹🇷',
  Ukrainian: '🇺🇦',
  Uruguayan: '🇺🇾',
  Vietnamese: '🇻🇳',
  Mediterranean: '🌊',
  Asian: '🥢',
  Vegetarian: '🥦',
};

export function CuisineChips({
  cuisines,
  selected,
  onSelect,
}: {
  cuisines: string[];
  selected: string;
  onSelect: (cuisine: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // A horizontal ScrollView flexes in its parent column: the flex:1 list
      // below squeezed it, and the chips' text was clipped at the baseline.
      style={{ flexGrow: 0, flexShrink: 0 }}
      contentContainerStyle={{ paddingHorizontal: SCREEN_PADDING, gap: 8, paddingVertical: 8 }}
    >
      {['All', ...cuisines].map((c) => {
        const active = c === 'All' ? selected === '' : selected === c;
        return (
          <Pressable
            key={c}
            onPress={() => onSelect(c === 'All' ? '' : c)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 20,
              backgroundColor: active ? colors.primary : colors.surface,
              borderWidth: 1,
              borderColor: active ? colors.primary : colors.border,
            }}
          >
            {c !== 'All' && <Text style={{ fontSize: 13 }}>{EMOJI[c] ?? '🍽️'}</Text>}
            <Text
              style={{
                fontFamily: fonts.semibold,
                fontSize: 13,
                color: active ? '#FFFFFF' : colors.textPrimary,
              }}
            >
              {c}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
