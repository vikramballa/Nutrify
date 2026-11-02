-- Allow the new 'like' event (👍 on a recipe). Swapping a CHECK constraint:
-- the new one is added NOT VALID (no table scan under lock) and, as in
-- 20261102120000_data_rules, validated only when existing rows pass, so old
-- bad rows warn instead of failing the deploy.
ALTER TABLE "UserEvent" DROP CONSTRAINT IF EXISTS "UserEvent_type_check";
ALTER TABLE "UserEvent" ADD CONSTRAINT "UserEvent_type_check"
  CHECK ("type" IN ('search','view','grocery','chat','log','favorite','like','dislike','suggest')) NOT VALID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "UserEvent"
                 WHERE "type" NOT IN ('search','view','grocery','chat','log','favorite','like','dislike','suggest')) THEN
    ALTER TABLE "UserEvent" VALIDATE CONSTRAINT "UserEvent_type_check";
  ELSE
    RAISE WARNING 'existing "UserEvent" rows break UserEvent_type_check; it applies to new rows only until they are fixed';
  END IF;
END $$;
