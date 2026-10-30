import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  ProfileInputSchema,
  computeMetrics,
  type ActivityLevel,
  type Condition,
  type Goal,
  type ProfileInput,
  type Sex,
} from '@nutrichef/shared';
import { colors } from '../theme/colors';
import { fonts, SCREEN_PADDING, type } from '../theme/typography';
import { Screen } from '../components/Screen';
import { RemindersCard } from '../components/RemindersCard';
import { AccountCard, AiFeaturesCard, HealthNote } from '../components/AccountSettings';
import { Card } from '../components/Card';
import { AuthField } from '../components/AuthField';
import { useAuth } from '../auth/AuthContext';
import { useProfile, useSaveProfile } from '../hooks/useProfile';

const SEXES: { value: Sex; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

const ACTIVITY: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: 'Sedentary' },
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'active', label: 'Active' },
  { value: 'very_active', label: 'Very active' },
];

const GOALS: { value: Goal; label: string }[] = [
  { value: 'lose_weight', label: 'Lose weight' },
  { value: 'maintain', label: 'Maintain' },
  { value: 'gain_weight', label: 'Gain weight' },
  { value: 'build_muscle', label: 'Build muscle' },
];

const CONDITIONS: { value: Condition; label: string }[] = [
  { value: 'diabetes', label: 'Diabetes' },
  { value: 'hypertension', label: 'High BP' },
  { value: 'high_cholesterol', label: 'High cholesterol' },
  { value: 'thyroid', label: 'Thyroid' },
];

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.primaryLight : colors.surface,
      }}
    >
      <Text
        style={{
          fontFamily: fonts.semibold,
          fontSize: 13,
          color: selected ? colors.primary : colors.textSecondary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Text style={type.sectionHeader}>{title}</Text>
      {children}
    </View>
  );
}

/**
 * The onboarding questionnaire after sign-up, and the same form again as
 * Settings. Answers drive BMI / body fat / calorie & macro goals.
 */
export function ProfileSetupScreen({ mode }: { mode: 'onboarding' | 'settings' }) {
  const profile = useProfile();
  // In settings, wait for the saved answers before mounting the form so the
  // fields start prefilled (useState initializers only run once).
  if (mode === 'settings' && !profile.data) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }
  return <ProfileForm mode={mode} existing={profile.data?.profile ?? null} />;
}

function ProfileForm({
  mode,
  existing,
}: {
  mode: 'onboarding' | 'settings';
  existing: ProfileInput | null;
}) {
  const nav = useNavigation();
  const { user, markOnboarded } = useAuth();
  const save = useSaveProfile();

  const [name, setName] = useState(existing?.name ?? user?.name ?? '');
  const [age, setAge] = useState(existing ? String(existing.age) : '');
  const [heightCm, setHeightCm] = useState(existing ? String(existing.heightCm) : '');
  const [weightKg, setWeightKg] = useState(existing ? String(existing.weightKg) : '');
  const [sex, setSex] = useState<Sex | null>(existing?.sex ?? null);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | null>(
    existing?.activityLevel ?? null,
  );
  const [goal, setGoal] = useState<Goal | null>(existing?.goal ?? null);
  const [hasConditions, setHasConditions] = useState<boolean | null>(
    existing ? existing.conditions.length > 0 : null,
  );
  const [conditions, setConditions] = useState<Condition[]>(existing?.conditions ?? []);
  const [error, setError] = useState<string | null>(null);

  function toggleCondition(c: Condition) {
    setConditions((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  }

  const draft = {
    name: name.trim(),
    age: Number(age),
    heightCm: Number(heightCm),
    weightKg: Number(weightKg),
    sex,
    activityLevel,
    goal,
    conditions: hasConditions ? conditions : [],
  };
  const parsed = ProfileInputSchema.safeParse(draft);
  // Live preview once the body measurements are in.
  const preview = parsed.success ? computeMetrics(parsed.data) : null;

  async function submit() {
    if (save.isPending) return;
    if (!parsed.success) {
      setError('Please fill in every field with realistic values.');
      return;
    }
    if (hasConditions && conditions.length === 0) {
      setError('Select your condition(s), or answer "No".');
      return;
    }
    setError(null);
    try {
      await save.mutateAsync(parsed.data as ProfileInput);
      markOnboarded(); // in onboarding this flips the gate into the app
      if (mode === 'settings') nav.goBack();
    } catch {
      setError('Could not save. Check your connection and try again.');
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ padding: SCREEN_PADDING, gap: 22 }}
          keyboardShouldPersistTaps="handled"
          // Under a header the KeyboardAvoidingView alone left fields low on
          // the page (the delete-account password) hidden behind the keyboard.
          automaticallyAdjustKeyboardInsets
        >
          {mode === 'settings' && (
            <>
              <Section title="Reminders">
                <RemindersCard />
              </Section>
              <Section title="Privacy">
                <AiFeaturesCard />
              </Section>
            </>
          )}

          {mode === 'onboarding' && (
            <View>
              <Text style={type.screenTitle}>Tell us about you</Text>
              <Text style={[type.caption, { marginTop: 4 }]}>
                We use this to calculate your BMI, body fat estimate and daily nutrition
                goals — you can change it any time in Settings.
              </Text>
            </View>
          )}

          <Section title="Basics">
            <AuthField
              icon="person-outline"
              placeholder="Name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
            <AuthField
              icon="calendar-outline"
              placeholder="Age (years)"
              suffix="years"
              value={age}
              onChangeText={setAge}
              keyboardType="number-pad"
            />
            <AuthField
              icon="resize-outline"
              placeholder="Height (cm)"
              suffix="cm"
              value={heightCm}
              onChangeText={setHeightCm}
              keyboardType="decimal-pad"
            />
            <AuthField
              icon="scale-outline"
              placeholder="Weight (kg)"
              suffix="kg"
              value={weightKg}
              onChangeText={setWeightKg}
              keyboardType="decimal-pad"
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {SEXES.map((s) => (
                <Chip
                  key={s.value}
                  label={s.label}
                  selected={sex === s.value}
                  onPress={() => setSex(s.value)}
                />
              ))}
            </View>
          </Section>

          <Section title="Activity level">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {ACTIVITY.map((a) => (
                <Chip
                  key={a.value}
                  label={a.label}
                  selected={activityLevel === a.value}
                  onPress={() => setActivityLevel(a.value)}
                />
              ))}
            </View>
          </Section>

          <Section title="Goal">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {GOALS.map((g) => (
                <Chip
                  key={g.value}
                  label={g.label}
                  selected={goal === g.value}
                  onPress={() => setGoal(g.value)}
                />
              ))}
            </View>
          </Section>

          <Section title="Any medical conditions?">
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Chip
                label="No"
                selected={hasConditions === false}
                onPress={() => {
                  setHasConditions(false);
                  setConditions([]);
                }}
              />
              <Chip
                label="Yes"
                selected={hasConditions === true}
                onPress={() => setHasConditions(true)}
              />
            </View>
            {hasConditions && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {CONDITIONS.map((c) => (
                  <Chip
                    key={c.value}
                    label={c.label}
                    selected={conditions.includes(c.value)}
                    onPress={() => toggleCondition(c.value)}
                  />
                ))}
              </View>
            )}
          </Section>

          {preview && (
            <Card style={{ padding: 16, gap: 4 }}>
              <Text style={type.cardTitle}>Your numbers</Text>
              <Text style={type.body}>
                BMI {preview.bmi} ({preview.bmiCategory}) · ~{preview.bodyFatPct}% body fat
              </Text>
              <Text style={type.caption}>
                Estimated daily burn: {preview.tdee} cal (BMR {preview.bmr})
              </Text>
            </Card>
          )}

          {error && (
            <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: '#DC2626' }}>
              {error}
            </Text>
          )}

          <Pressable
            onPress={submit}
            disabled={save.isPending}
            style={{
              height: 54,
              borderRadius: 16,
              backgroundColor: save.isPending ? colors.textTertiary : colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {save.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: '#fff' }}>
                {mode === 'onboarding' ? 'Create my plan' : 'Save changes'}
              </Text>
            )}
          </Pressable>

          {mode === 'settings' && (
            <Section title="Account">
              <AccountCard />
            </Section>
          )}
          <HealthNote />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
