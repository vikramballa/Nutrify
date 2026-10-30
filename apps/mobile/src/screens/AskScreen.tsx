import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ChatMessage } from '@nutrichef/shared';
import { colors } from '../theme/colors';
import { SCREEN_PADDING, fonts, radii, type } from '../theme/typography';
import { Screen } from '../components/Screen';
import { RichText } from '../components/RichText';
import { LogoAvatar } from '../components/Logo';
import {
  useChatHistory,
  useClearChat,
  useDeleteMessage,
  useEditMessage,
  useSendMessage,
} from '../hooks/useChat';
import { useAiConsent } from '../hooks/useAiConsent';

const WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Hi — I'm your recipe and nutrition assistant.\n" +
    'Ask me about **cooking, ingredients, or nutrition**, and I will keep the numbers front and centre.\n' +
    "I share general information, not medical advice — check with your doctor before changing your diet.",
  createdAt: '',
};

const SUGGESTIONS = [
  'A quick high-protein dinner',
  'How many calories in an avocado?',
  'Swap paneer for something leaner',
  'Plan a 500 kcal lunch',
];

/**
 * Assistant replies type themselves out once. Tracked per message id at module
 * scope so a history refetch re-mounts the bubbles without replaying every
 * answer in the thread.
 */
const revealed = new Set<string>();

export function AskScreen() {
  const history = useChatHistory();
  const send = useSendMessage();
  const edit = useEditMessage();
  const remove = useDeleteMessage();
  const clear = useClearChat();
  const aiConsent = useAiConsent();

  const [text, setText] = useState('');
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const inputRef = useRef<TextInput>(null);

  const thread = history.data?.messages ?? [];
  const messages = thread.length > 0 ? thread : [WELCOME];
  const sending = send.isPending || edit.isPending;

  function describe(err: unknown): string {
    switch ((err as { status?: number }).status) {
      case 403:
        return 'Turn on AI features in Settings to chat with the assistant.';
      case 503:
        return 'The assistant is unavailable right now. Please try again in a few minutes.';
      default:
        return 'Could not reach the assistant. Check your connection and try again.';
    }
  }

  async function submit(override?: string) {
    const message = (override ?? text).trim();
    if (!message || sending) return;
    if (!(await aiConsent.ensure())) return;
    setFailure(null);
    const pending = editing;
    setText('');
    setEditing(null);
    try {
      if (pending) await edit.mutateAsync({ id: pending.id, message });
      else await send.mutateAsync(message);
    } catch (err) {
      setFailure(describe(err));
      if (pending) setEditing(pending); // keep the edit alive so it can be retried
      setText(message);
    } finally {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }

  function startEdit(message: ChatMessage) {
    setEditing(message);
    setText(message.content);
    inputRef.current?.focus();
  }

  function confirmDelete(message: ChatMessage) {
    Alert.alert(
      'Delete this message?',
      message.role === 'user' ? 'The answer to it is removed too.' : undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(message.id) },
      ],
    );
  }

  /** Long-press menu. Only your own questions can be rewritten. */
  function openActions(message: ChatMessage) {
    if (message.id === WELCOME.id) return;
    Alert.alert(message.role === 'user' ? 'Your message' : 'Assistant reply', undefined, [
      ...(message.role === 'user'
        ? [{ text: 'Edit and ask again', onPress: () => startEdit(message) }]
        : []),
      { text: 'Delete', style: 'destructive' as const, onPress: () => confirmDelete(message) },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  function confirmClear() {
    Alert.alert('Clear this chat?', 'The whole conversation is deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => clear.mutate(undefined) },
    ]);
  }

  const canSend = text.trim().length > 0 && !sending;
  const showSuggestions = thread.length === 0 && !sending;

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: SCREEN_PADDING,
            paddingTop: 6,
            paddingBottom: 12,
          }}
        >
          <LogoAvatar size={40} />
          <View style={{ flex: 1 }}>
            <Text style={[type.screenTitle, { fontSize: 24, lineHeight: 28 }]}>Ask NutriChef</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: radii.pill,
                  backgroundColor: sending ? colors.primary : colors.success,
                }}
              />
              <Text style={type.caption}>{sending ? 'Working on it' : 'Ready'}</Text>
            </View>
          </View>
          {thread.length > 0 && (
            <Pressable
              onPress={confirmClear}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Clear chat history"
              style={({ pressed }) => ({ padding: 8, opacity: pressed ? 0.5 : 1 })}
            >
              <Ionicons name="trash-outline" size={21} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingHorizontal: SCREEN_PADDING, paddingBottom: 16, gap: 14 }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
            <Bubble
              message={item}
              editing={editing?.id === item.id}
              onLongPress={() => openActions(item)}
              onEdit={() => startEdit(item)}
              onDelete={() => confirmDelete(item)}
            />
          )}
          ListFooterComponent={
            sending ? (
              <TypingBubble />
            ) : failure ? (
              <Bubble
                message={{ id: 'failure', role: 'assistant', content: failure, createdAt: '' }}
                tone="error"
              />
            ) : showSuggestions ? (
              <Suggestions onPick={submit} />
            ) : null
          }
        />

        {editing && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              marginHorizontal: SCREEN_PADDING,
              marginBottom: 8,
              paddingHorizontal: 12,
              paddingVertical: 9,
              borderRadius: radii.md,
              backgroundColor: colors.primaryLight,
            }}
          >
            <Ionicons name="create-outline" size={16} color={colors.primaryDark} />
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                fontFamily: fonts.medium,
                fontSize: 12.5,
                color: colors.primaryDark,
              }}
            >
              Editing: {editing.content}
            </Text>
            <Pressable
              onPress={() => {
                setEditing(null);
                setText('');
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Cancel edit"
            >
              <Ionicons name="close" size={17} color={colors.primaryDark} />
            </Pressable>
          </View>
        )}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 10,
            paddingHorizontal: SCREEN_PADDING,
            paddingTop: 10,
            paddingBottom: 14,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            backgroundColor: colors.surface,
          }}
        >
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            placeholder={editing ? 'Rewrite your question' : 'Ask about recipes or nutrition'}
            placeholderTextColor={colors.textTertiary}
            multiline
            style={{
              flex: 1,
              maxHeight: 120,
              minHeight: 46,
              backgroundColor: colors.surfaceAlt,
              borderRadius: radii.xl,
              borderWidth: 1,
              borderColor: editing ? colors.primary : colors.border,
              paddingHorizontal: 16,
              paddingTop: 13,
              paddingBottom: 13,
              fontFamily: fonts.regular,
              fontSize: 14.5,
              lineHeight: 20,
              color: colors.textPrimary,
            }}
            onSubmitEditing={() => submit()}
            returnKeyType="send"
            blurOnSubmit
          />
          <Pressable
            onPress={() => submit()}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel={editing ? 'Save and ask again' : 'Send message'}
            style={({ pressed }) => ({
              width: 46,
              height: 46,
              borderRadius: radii.pill,
              backgroundColor: canSend ? colors.primary : colors.primaryLight,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ scale: pressed ? 0.94 : 1 }],
              shadowColor: colors.primaryDark,
              shadowOpacity: canSend ? 0.35 : 0,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
              elevation: canSend ? 4 : 0,
            })}
          >
            <Ionicons
              name={editing ? 'checkmark' : 'arrow-up'}
              size={22}
              color={canSend ? '#fff' : colors.primary}
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Suggestions({ onPick }: { onPick: (q: string) => void }) {
  return (
    <View style={{ marginTop: 4, gap: 10 }}>
      <Text style={type.eyebrow}>TRY ASKING</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {SUGGESTIONS.map((s) => (
          <Pressable
            key={s}
            onPress={() => onPick(s)}
            style={({ pressed }) => ({
              paddingHorizontal: 14,
              paddingVertical: 9,
              borderRadius: radii.pill,
              backgroundColor: pressed ? colors.primaryLight : colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
          >
            <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.textPrimary }}>
              {s}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Bubble({
  message,
  tone,
  editing,
  onLongPress,
  onEdit,
  onDelete,
}: {
  message: ChatMessage;
  tone?: 'error';
  editing?: boolean;
  onLongPress?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const isUser = message.role === 'user';
  const enter = useRef(new Animated.Value(0)).current;
  const seen = isUser || revealed.has(message.id);
  const [shown, setShown] = useState(seen ? message.content : '');

  // ponytail: typewriter over already-fetched text — looks like streaming
  // without wiring SSE. Runs once per message id (see `revealed`).
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    if (seen) return;
    revealed.add(message.id);
    const full = message.content;
    const step = Math.max(2, Math.ceil(full.length / 150)); // ~2.4s regardless of length
    let i = 0;
    const id = setInterval(() => {
      i += step;
      if (i >= full.length) {
        setShown(full);
        clearInterval(id);
      } else {
        setShown(full.slice(0, i));
      }
    }, 16);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // An edit rewrites content in place; keep an already-revealed bubble in sync.
  useEffect(() => {
    if (seen) setShown(message.content);
  }, [message.content, seen]);

  const typing = !isUser && shown.length < message.content.length;
  const isError = tone === 'error';

  const animation = {
    opacity: enter,
    transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
  };

  if (isUser) {
    return (
      <Animated.View style={[{ alignSelf: 'flex-end', maxWidth: '84%' }, animation]}>
        <Pressable onLongPress={onLongPress} delayLongPress={250}>
          <View
            style={{
              backgroundColor: colors.primary,
              borderRadius: radii.lg,
              borderBottomRightRadius: 6, // tail corner
              paddingHorizontal: 15,
              paddingVertical: 11,
              borderWidth: editing ? 2 : 0,
              borderColor: colors.primaryDark,
              shadowColor: colors.primaryDark,
              shadowOpacity: 0.25,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 5 },
              elevation: 3,
            }}
          >
            <Text style={[type.body, { color: '#fff' }]}>{message.content}</Text>
          </View>
        </Pressable>
        {/* Visible affordance — long-press alone is undiscoverable. */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 4, marginTop: 4 }}>
          <BubbleAction icon="create-outline" label="Edit message" onPress={onEdit} />
          <BubbleAction icon="trash-outline" label="Delete message" onPress={onDelete} />
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={[{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '92%' }, animation]}
    >
      <LogoAvatar size={28} />
      <Pressable onLongPress={onLongPress} delayLongPress={250} style={{ flex: 1 }}>
        <View
          style={{
            backgroundColor: isError ? colors.dangerLight : colors.surface,
            borderRadius: radii.lg,
            borderBottomLeftRadius: 6,
            borderWidth: 1,
            borderColor: isError ? '#F4C9C2' : colors.border,
            paddingHorizontal: 15,
            paddingVertical: 12,
            shadowColor: colors.shadow,
            shadowOpacity: 0.06,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: 2,
          }}
        >
          {isError && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Ionicons name="alert-circle" size={15} color={colors.danger} />
              <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: colors.danger }}>
                Assistant unavailable
              </Text>
            </View>
          )}
          <RichText text={shown + (typing ? '▋' : '')} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

function BubbleAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
}) {
  if (!onPress) return null;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        padding: 5,
        borderRadius: radii.pill,
        backgroundColor: pressed ? colors.primaryLight : 'transparent',
      })}
    >
      <Ionicons name={icon} size={15} color={colors.textTertiary} />
    </Pressable>
  );
}

function TypingBubble() {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;
  const c = useRef(new Animated.Value(0)).current;
  const dots = [a, b, c];

  useEffect(() => {
    const loops = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 140),
          Animated.timing(d, { toValue: 1, duration: 320, useNativeDriver: true }),
          Animated.timing(d, { toValue: 0, duration: 320, useNativeDriver: true }),
          Animated.delay(280 - i * 140),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 14 }}>
      <LogoAvatar size={28} />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          backgroundColor: colors.surface,
          borderRadius: radii.lg,
          borderBottomLeftRadius: 6,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: 16,
          paddingVertical: 14,
        }}
      >
        {dots.map((d, i) => (
          <Animated.View
            key={i}
            style={{
              width: 7,
              height: 7,
              borderRadius: radii.pill,
              backgroundColor: colors.primary,
              opacity: d.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
              transform: [
                { translateY: d.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) },
              ],
            }}
          />
        ))}
      </View>
    </View>
  );
}
