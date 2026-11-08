-- Allow the 'beverage' meal type (tea, coffee, soft drinks), so a cup of chai
-- stops being filed as lunch. Swapped the same way as 20261102160000_event_type_like:
-- added NOT VALID, validated only when existing rows pass.
ALTER TABLE "MealLog" DROP CONSTRAINT IF EXISTS "MealLog_mealType_check";
ALTER TABLE "MealLog" ADD CONSTRAINT "MealLog_mealType_check"
  CHECK ("mealType" IN ('breakfast','lunch','dinner','snack','beverage')) NOT VALID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MealLog"
                 WHERE "mealType" NOT IN ('breakfast','lunch','dinner','snack','beverage')) THEN
    ALTER TABLE "MealLog" VALIDATE CONSTRAINT "MealLog_mealType_check";
  ELSE
    RAISE WARNING 'existing "MealLog" rows break MealLog_mealType_check; it applies to new rows only until they are fixed';
  END IF;
END $$;
