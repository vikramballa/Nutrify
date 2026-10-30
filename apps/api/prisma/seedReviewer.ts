import { PrismaClient } from '@prisma/client';
import { computeGoals, type ProfileInput } from '@nutrichef/shared';
import { hashPassword } from '../src/lib/auth.js';

const prisma = new PrismaClient();

// The account App Review signs in with (guideline 2.1). It arrives onboarded,
// with a week of logs and weigh-ins, so every screen has something to show
// instead of empty states. Re-running resets it to the same state.
//
//   REVIEW_EMAIL=... REVIEW_PASSWORD=... npm run db:seed:reviewer -w apps/api

const email = (process.env.REVIEW_EMAIL ?? 'appreview@nutrichef.app').toLowerCase();
const password = process.env.REVIEW_PASSWORD;

const profile: ProfileInput = {
  name: 'App Review',
  age: 32,
  heightCm: 172,
  weightKg: 74,
  sex: 'female',
  activityLevel: 'moderate',
  goal: 'lose_weight',
  conditions: [],
};

const MEALS = [
  { mealType: 'breakfast', name: 'Oats with banana', calories: 380, protein: 12, carbs: 64, fat: 8 },
  { mealType: 'lunch', name: 'Chicken rice bowl', calories: 610, protein: 42, carbs: 70, fat: 15 },
  { mealType: 'snack', name: 'Greek yogurt', calories: 150, protein: 15, carbs: 8, fat: 6 },
  { mealType: 'dinner', name: 'Dal with roti', calories: 520, protein: 22, carbs: 78, fat: 12 },
] as const;

function utcDay(daysAgo: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d;
}

async function main() {
  if (!password || password.length < 8) {
    throw new Error('Set REVIEW_PASSWORD (8+ characters) — it goes into App Store Connect');
  }

  // Start clean so the account always looks the same to a reviewer.
  await prisma.user.deleteMany({ where: { email } });
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      ...profile,
      onboarded: true,
      goals: { create: computeGoals(profile) },
    },
  });

  const logs = [];
  const weights = [];
  for (let day = 6; day >= 0; day--) {
    const date = utcDay(day);
    // Today only has breakfast and lunch so far, like a real mid-day check.
    const meals = day === 0 ? MEALS.slice(0, 2) : MEALS;
    for (const [i, meal] of meals.entries()) {
      logs.push({ userId: user.id, ...meal, at: new Date(date.getTime() + (8 + i * 4) * 3_600_000) });
    }
    weights.push({ userId: user.id, date, kg: 74 - (6 - day) * 0.1 });
  }
  await prisma.mealLog.createMany({ data: logs });
  await prisma.weightEntry.createMany({ data: weights });
  await prisma.waterLog.create({ data: { userId: user.id, date: utcDay(0), ml: 750 } });

  console.log(`Reviewer account ready: ${email} (${logs.length} meals, ${weights.length} weigh-ins)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
