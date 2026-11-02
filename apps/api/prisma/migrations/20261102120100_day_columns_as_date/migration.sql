-- Day columns become DATE: a calendar day can no longer carry a stray time
-- that puts it on the wrong day or slips past the one-weigh-in-per-day rule.
-- The app already stores UTC midnight, so ::date keeps every value's day.
-- (These tables are small; the type change rewrites them under a brief lock.)

-- Two weigh-ins on the same day would collide on (userId, date) once the
-- time part is gone: keep the newest.
DELETE FROM "WeightEntry" a
USING "WeightEntry" b
WHERE a."userId" = b."userId"
  AND a."date"::date = b."date"::date
  AND (a."createdAt", a."id") < (b."createdAt", b."id");

ALTER TABLE "WeightEntry" ALTER COLUMN "date" TYPE DATE USING "date"::date;
ALTER TABLE "WaterLog" ALTER COLUMN "date" TYPE DATE USING "date"::date;
ALTER TABLE "MealPlanEntry" ALTER COLUMN "date" TYPE DATE USING "date"::date;
