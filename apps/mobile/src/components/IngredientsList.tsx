import { useEffect, useRef, useState } from 'react';
import { Animated, LayoutAnimation, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { fonts, type } from '../theme/typography';

const GREEN = '#16A34A';
const UNICODE: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };

// "600 g" → { qty: 600, rest: "g" }; "to taste" → null (nothing to scale).
// ponytail: ranges ("2-3") take the low end; good enough for a cook helper.
function parseQty(measure: string): { qty: number; rest: string } | null {
  const s = measure.trim();
  let x: RegExpMatchArray | null;
  if ((x = s.match(/^(\d+)\s+(\d+)\/(\d+)\s*(.*)$/))) return { qty: +x[1] + +x[2] / +x[3], rest: x[4].trim() };
  if ((x = s.match(/^(\d+)\/(\d+)\s*(.*)$/))) return { qty: +x[1] / +x[2], rest: x[3].trim() };
  if ((x = s.match(/^(\d*\.?\d+)(?:\s*-\s*\d*\.?\d+)?\s*(.*)$/))) return { qty: +x[1], rest: x[2].trim() };
  if (UNICODE[s[0]] != null) return { qty: UNICODE[s[0]], rest: s.slice(1).trim() };
  return null;
}

// Pretty amount: fractions for small cooking amounts, rounded integers for g/ml.
function fmtQty(n: number): string {
  if (n <= 0) return '0';
  if (n >= 10) return String(Math.round(n));
  const w = Math.floor(n + 1e-9);
  const f = n - w;
  const FR: [number, string][] = [
    [0, ''], [0.125, '⅛'], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾'], [1, ''],
  ];
  let best: [number, string] | null = null;
  let bd = 0.06;
  for (const fr of FR) {
    const d = Math.abs(f - fr[0]);
    if (d < bd) { bd = d; best = fr; }
  }
  if (best) {
    const whole = w + (best[0] === 1 ? 1 : 0);
    const g = best[0] === 1 ? '' : best[1];
    if (g) return whole ? `${whole} ${g}` : g;
    return `${whole}`;
  }
  return String(Math.round(n * 10) / 10);
}

function scaleMeasure(measure: string, factor: number): string {
  const p = parseQty(measure);
  if (!p) return measure;
  // "3, pureed" keeps its comma tight: a blanket space read "3 , pureed".
  const sep = /^[,;)]/.test(p.rest) ? '' : ' ';
  return fmtQty(p.qty * factor) + (p.rest ? `${sep}${p.rest}` : '');
}

const PRESETS = [
  { label: '½×', f: 0.5 },
  { label: '1×', f: 1 },
  { label: '2×', f: 2 },
  { label: '3×', f: 3 },
];

function Row({
  index,
  name,
  measure,
  baseUnit,
  canScale,
  editing,
  onCheckToggle,
  onTapAmount,
  onApply,
  onCancel,
}: {
  index: number;
  name: string;
  measure: string;
  baseUnit: string;
  canScale: boolean;
  editing: boolean;
  onCheckToggle: () => void;
  onTapAmount: () => void;
  onApply: (have: number) => void;
  onCancel: () => void;
}) {
  const enter = useRef(new Animated.Value(0)).current;
  const check = useRef(new Animated.Value(0)).current;
  const [done, setDone] = useState(false);
  const [have, setHave] = useState('');

  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 300, delay: index * 55, useNativeDriver: true }).start();
  }, []);
  useEffect(() => {
    Animated.spring(check, { toValue: done ? 1 : 0, friction: 5, useNativeDriver: true }).start();
  }, [done]);

  return (
    <Animated.View
      style={{ opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 }}>
        <Pressable
          onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setDone((d) => !d);
            onCheckToggle();
          }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
        >
          <View style={{ width: 20, height: 20 }}>
            <Animated.View
              style={{
                position: 'absolute', width: 7, height: 7, borderRadius: 4, top: 7, left: 7,
                backgroundColor: colors.textTertiary,
                opacity: check.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
              }}
            />
            <Animated.View style={{ position: 'absolute', opacity: check, transform: [{ scale: check }] }}>
              <Ionicons name="checkmark-circle" size={20} color={GREEN} />
            </Animated.View>
          </View>
          <Text style={[type.body, { flex: 1 }, done && { textDecorationLine: 'line-through', color: colors.textTertiary }]}>
            {name}
          </Text>
        </Pressable>

        {/* Amount pill — tap to scale the whole recipe to what you have. */}
        <Pressable onPress={onTapAmount} disabled={!canScale} hitSlop={6}>
          <Text
            style={{
              fontFamily: fonts.semibold,
              fontSize: 13.5,
              color: canScale ? colors.primary : colors.textSecondary,
              backgroundColor: canScale ? colors.primaryLight : 'transparent',
              paddingHorizontal: canScale ? 8 : 0,
              paddingVertical: canScale ? 3 : 0,
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            {measure}
          </Text>
        </Pressable>
      </View>

      {editing && (
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 30, marginBottom: 8,
            marginTop: 2,
          }}
        >
          <Text style={type.caption}>I have</Text>
          <TextInput
            value={have}
            onChangeText={setHave}
            keyboardType="decimal-pad"
            autoFocus
            placeholder="200"
            placeholderTextColor={colors.textTertiary}
            style={{
              width: 64, height: 38, borderRadius: 10, backgroundColor: colors.surface,
              borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10,
              fontFamily: fonts.semibold, fontSize: 14, color: colors.textPrimary, textAlign: 'center',
            }}
          />
          <Text style={type.caption}>{baseUnit || 'units'}</Text>
          <Pressable
            onPress={() => { const n = Number(have); if (n > 0) onApply(n); }}
            style={{ paddingHorizontal: 14, height: 38, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: '#fff' }}>Set</Text>
          </Pressable>
          <Pressable onPress={onCancel} hitSlop={8}>
            <Ionicons name="close" size={18} color={colors.textTertiary} />
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
}

/** Ingredients that animate in, tick off while shopping, and scale to what you have. */
export function IngredientsList({ items }: { items: { measure: string; name: string }[] }) {
  const [factor, setFactor] = useState(1);
  const [editing, setEditing] = useState<number | null>(null);
  const custom = !PRESETS.some((p) => Math.abs(p.f - factor) < 1e-6);

  const openEditor = (i: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEditing((e) => (e === i ? null : i));
  };
  const setScale = (f: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFactor(f);
    setEditing(null);
  };

  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Text style={type.sectionHeader}>Ingredients</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {PRESETS.map((p) => {
            const active = Math.abs(p.f - factor) < 1e-6;
            return (
              <Pressable
                key={p.label}
                onPress={() => setScale(p.f)}
                style={{
                  paddingHorizontal: 11, paddingVertical: 6, borderRadius: 9,
                  backgroundColor: active ? colors.primary : colors.surface,
                  borderWidth: 1, borderColor: active ? colors.primary : colors.border,
                }}
              >
                <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: active ? '#fff' : colors.textSecondary }}>
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {custom && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <Ionicons name="resize-outline" size={14} color={colors.primary} />
          <Text style={[type.caption, { color: colors.primary }]}>
            Scaled to {fmtQty(factor)}× what the recipe makes
          </Text>
        </View>
      )}

      {items.map((ing, i) => {
        const p = parseQty(ing.measure);
        return (
          <Row
            key={i}
            index={i}
            name={ing.name}
            measure={scaleMeasure(ing.measure, factor)}
            baseUnit={p?.rest ?? ''}
            canScale={p != null}
            editing={editing === i}
            onCheckToggle={() => {}}
            onTapAmount={() => openEditor(i)}
            onApply={(have) => p && setScale(have / p.qty)}
            onCancel={() => openEditor(i)}
          />
        );
      })}

      <Text style={[type.caption, { marginTop: 8, color: colors.textTertiary }]}>
        Tap an amount to scale the whole recipe to what you have.
      </Text>
    </View>
  );
}
