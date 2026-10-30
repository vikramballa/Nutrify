import type { FastifyInstance } from 'fastify';
import { AddWaterSchema, UpsertWeightSchema } from '@nutrichef/shared';
import { prisma } from '../lib/prisma.js';
import { computeDailyTotals, dayRange, resolveDay } from '../services/tracking.js';
import { dayKey } from '../services/mealplan.js';
import { intParam } from '../lib/query.js';

function waterDTO(w: { id: string; date: Date; ml: number; createdAt: Date }) {
  return { id: w.id, date: dayKey(w.date), ml: w.ml, createdAt: w.createdAt.toISOString() };
}

function weightDTO(w: {
  id: string;
  date: Date;
  kg: number;
  note: string | null;
  createdAt: Date;
}) {
  return {
    id: w.id,
    date: dayKey(w.date),
    kg: w.kg,
    note: w.note,
    createdAt: w.createdAt.toISOString(),
  };
}

export async function trackingRoutes(app: FastifyInstance) {
  // Add a water entry for a day (defaults to today, UTC).
  app.post('/water', async (req, reply) => {
    const parsed = AddWaterSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_water' });
    const date = resolveDay(parsed.data.date);
    if (!date) return reply.code(400).send({ error: 'invalid_date' });
    const log = await prisma.waterLog.create({
      data: { userId: req.userId, date, ml: parsed.data.ml },
    });
    return waterDTO(log);
  });

  // Today's water: total ml + individual entries (drives the Home water card).
  app.get('/water/today', async (req) => {
    const today = resolveDay(undefined)!;
    const entries = await prisma.waterLog.findMany({
      where: { userId: req.userId, date: today },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 100,
    });
    const totalMl = entries.reduce((t, e) => t + e.ml, 0);
    return { date: dayKey(today), totalMl, entries: entries.map(waterDTO) };
  });

  app.delete<{ Params: { id: string } }>('/water/:id', async (req, reply) => {
    const { count } = await prisma.waterLog.deleteMany({
      where: { id: req.params.id, userId: req.userId },
    });
    if (count === 0) return reply.code(404).send({ error: 'not_found' });
    return { ok: true };
  });

  // One weigh-in per day: a second PUT for the same day overwrites the first.
  app.put('/weight', async (req, reply) => {
    const parsed = UpsertWeightSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_weight' });
    const date = resolveDay(parsed.data.date);
    if (!date) return reply.code(400).send({ error: 'invalid_date' });
    const { kg, note } = parsed.data;
    const entry = await prisma.weightEntry.upsert({
      where: { userId_date: { userId: req.userId, date } },
      update: { kg, note: note ?? null },
      create: { userId: req.userId, date, kg, note: note ?? null },
    });
    return weightDTO(entry);
  });

  app.get<{ Querystring: { days?: string } }>('/weight', async (req) => {
    const range = dayRange(intParam(req.query.days, 30, 365));
    const entries = await prisma.weightEntry.findMany({
      where: { userId: req.userId, date: { gte: range.start, lt: range.endExclusive } },
      orderBy: { date: 'asc' },
      take: 500,
    });
    return entries.map(weightDTO);
  });

  // Per-day macro totals from actual meal logs, so the mobile weekly chart
  // doesn't recompute them.
  app.get<{ Querystring: { days?: string } }>('/progress/summary', async (req) => {
    const range = dayRange(intParam(req.query.days, 7, 90));
    const logs = await prisma.mealLog.findMany({
      where: { userId: req.userId, at: { gte: range.start, lt: range.endExclusive } },
      select: { at: true, calories: true, protein: true, carbs: true, fat: true },
      take: 5000,
    });
    return { days: computeDailyTotals(range.days, logs) };
  });
}
