import { Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { fonts, radii, type } from '../theme/typography';
import { parseBlocks, type Block, type Inline } from './markdownLite';

/**
 * Renders assistant replies: headings, lists, **bold**, `code`, and
 * quantities ("320 kcal") lifted into highlight chips so the numbers that
 * matter are readable at a glance.
 */
export function RichText({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <View style={{ gap: 8 }}>
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </View>
  );
}

function BlockView({ block }: { block: Block }) {
  if (block.kind === 'heading') {
    return (
      <Text
        style={{
          fontFamily: fonts.bold,
          fontSize: 15,
          lineHeight: 21,
          letterSpacing: -0.2,
          color: colors.textPrimary,
        }}
      >
        <Spans spans={block.spans} />
      </Text>
    );
  }

  if (block.kind === 'bullet' || block.kind === 'numbered') {
    return (
      <View style={{ flexDirection: 'row', gap: 9 }}>
        {block.kind === 'bullet' ? (
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: radii.pill,
              backgroundColor: colors.primary,
              marginTop: 8, // optical: sits on the x-height, not the top of the line box
            }}
          />
        ) : (
          <View
            style={{
              minWidth: 20,
              height: 20,
              paddingHorizontal: 5,
              borderRadius: radii.pill,
              backgroundColor: colors.primaryLight,
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 1,
            }}
          >
            <Text
              style={{
                fontFamily: fonts.bold,
                fontSize: 11,
                color: colors.primaryDark,
                fontVariant: ['tabular-nums'],
              }}
            >
              {block.index}
            </Text>
          </View>
        )}
        <Text style={[type.body, { flex: 1 }]}>
          <Spans spans={block.spans} />
        </Text>
      </View>
    );
  }

  return (
    <Text style={type.body}>
      <Spans spans={block.spans} />
    </Text>
  );
}

function Spans({ spans }: { spans: Inline[] }) {
  return (
    <>
      {spans.map((span, i) => {
        if (span.kind === 'bold') {
          return (
            <Text key={i} style={{ fontFamily: fonts.bold, color: colors.textPrimary }}>
              {span.text}
            </Text>
          );
        }
        if (span.kind === 'stat') {
          return (
            <Text
              key={i}
              style={{
                fontFamily: fonts.bold,
                color: colors.highlightText,
                backgroundColor: colors.highlight,
                fontVariant: ['tabular-nums'],
              }}
            >
              {` ${span.text} `}
            </Text>
          );
        }
        if (span.kind === 'code') {
          return (
            <Text
              key={i}
              style={{
                fontFamily: fonts.semibold,
                color: colors.primaryDark,
                backgroundColor: colors.primarySoft,
              }}
            >
              {` ${span.text} `}
            </Text>
          );
        }
        return <Text key={i}>{span.text}</Text>;
      })}
    </>
  );
}
