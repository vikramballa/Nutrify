import { Text, TextStyle } from 'react-native';
import { fonts, type } from '../theme/typography';

/** Renders plain text with **bold** spans (splits on `**`). */
export function BoldText({ text, style }: { text: string; style?: TextStyle }) {
  const parts = text.split('**');
  return (
    <Text style={[type.body, style]}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Text key={i} style={{ fontFamily: fonts.bold }}>
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}
