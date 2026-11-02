-- Data rules the app already follows, now enforced by Postgres too, so a bug
-- or a hand-written query can't store an impossible row.
--
-- Each rule is added NOT VALID: it applies to every new or updated row at
-- once, without scanning the table under a lock. It is then VALIDATED only if
-- every existing row already passes; otherwise a WARNING names it and the
-- deploy still succeeds. Find any left unvalidated with:
--   SELECT conrelid::regclass, conname FROM pg_constraint WHERE NOT convalidated;
-- fix those rows, then run ALTER TABLE ... VALIDATE CONSTRAINT ....
--
-- (A NULL passes a CHECK, so optional columns stay optional.)

-- Tidy values that differ only by case or spaces before checking them.
UPDATE "MealLog" SET "mealType" = lower(trim("mealType")) WHERE "mealType" <> lower(trim("mealType"));
UPDATE "MealPlanEntry" SET "slot" = lower(trim("slot")) WHERE "slot" <> lower(trim("slot"));

ALTER TABLE "MealLog" ADD CONSTRAINT "MealLog_mealType_check" CHECK ("mealType" IN ('breakfast','lunch','dinner','snack')) NOT VALID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MealLog" WHERE NOT ("mealType" IN ('breakfast','lunch','dinner','snack'))) THEN
    ALTER TABLE "MealLog" VALIDATE CONSTRAINT "MealLog_mealType_check";
  ELSE
    RAISE WARNING 'existing "MealLog" rows break MealLog_mealType_check; it applies to new rows only until they are fixed';
  END IF;
END $$;

ALTER TABLE "MealLog" ADD CONSTRAINT "MealLog_macros_check" CHECK ("calories" >= 0 AND "protein" >= 0 AND "carbs" >= 0 AND "fat" >= 0) NOT VALID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MealLog" WHERE NOT ("calories" >= 0 AND "protein" >= 0 AND "carbs" >= 0 AND "fat" >= 0)) THEN
    ALTER TABLE "MealLog" VALIDATE CONSTRAINT "MealLog_macros_check";
  ELSE
    RAISE WARNING 'existing "MealLog" rows break MealLog_macros_check; it applies to new rows only until they are fixed';
  END IF;
END $$;

ALTER TABLE "MealPlanEntry" ADD CONSTRAINT "MealPlanEntry_slot_check" CHECK ("slot" IN ('breakfast','lunch','dinner','snack')) NOT VALID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MealPlanEntry" WHERE NOT ("slot" IN ('breakfast','lunch','dinner','snack'))) THEN
    ALTER TABLE "MealPlanEntry" VALIDATE CONSTRAINT "MealPlanEntry_slot_check";
  ELSE
    RAISE WARNING 'existing "MealPlanEntry" rows break MealPlanEntry_slot_check; it applies to new rows only until they are fixed';
  END IF;
END $$;

ALTER TABLE "MealPlanEntry" ADD CONSTRAINT "MealPlanEntry_servings_check" CHECK ("servings" BETWEEN 1 AND 20) NOT VALID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MealPlanEntry" WHERE NOT ("servings" BETWEEN 1 AND 20)) THEN
    ALTER TABLE "MealPlanEntry" VALIDATE CONSTRAINT "MealPlanEntry_servings_check";
  ELSE
    RAISE WARNING 'existing "MealPlanEntry" rows break MealPlanEntry_servings_check; it applies to new rows only until they are fixed';
  END IF;
END $$;

ALTER TABLE "MealPlanEntry" ADD CONSTRAINT "MealPlanEntry_target_check" CHECK (num_nonnulls("recipeId", "customName") >= 1) NOT VALID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MealPlanEntry" WHERE NOT (num_nonnulls("recipeId", "customName") >= 1)) THEN
    ALTER TABLE "MealPlanEntry" VALIDATE CONSTRAINT "MealPlanEntry_target_check";
  ELSE
    RAISE WARNING 'existing "MealPlanEntry" rows break MealPlanEntry_target_check; it applies to new rows only until they are fixed';
  END IF;
END $$;

ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_source_check" CHECK ("source" IN ('MEALDB','AI')) NOT VALID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Recipe" WHERE NOT ("source" IN ('MEALDB','AI'))) THEN
    ALTER TABLE "Recipe" VALIDATE CONSTRAINT "Recipe_source_check";
  ELSE
    RAISE WARNING 'existing "Recipe" rows break Recipe_source_check; it applies to new rows only until they are fixed';
  END IF;
END $$;

ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_macros_check" CHECK ("calories" >= 0 AND "protein" >= 0 AND "carbs" >= 0 AND "fat" >= 0) NOT VALID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Recipe" WHERE NOT ("calories" >= 0 AND "protein" >= 0 AND "carbs" >= 0 AND "fat" >= 0)) THEN
    ALTER TABLE "Recipe" VALIDATE CONSTRAINT "Recipe_macros_check";
  ELSE
    RAISE WARNING 'existing "Recipe" rows break Recipe_macros_check; it applies to new rows only until they are fixed';
  END IF;
END $$;

ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_servings_check" CHECK ("servings" >= 1 AND "declaredServings" >= 1 AND "servingGrams" > 0) NOT VALID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Recipe" WHERE NOT ("servings" >= 1 AND "declaredServings" >= 1 AND "servingGrams" > 0)) THEN
    ALTER TABLE "Recipe" VALIDATE CONSTRAINT "Recipe_servings_check";
  ELSE
    RAISE WARNING 'existing "Recipe" rows break Recipe_servings_check; it applies to new rows only until they are fixed';
  END IF;
END $$;

ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_minutes_check" CHECK ("prepMinutes" >= 0 AND "cookMinutes" >= 0) NOT VALID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Recipe" WHERE NOT ("prepMinutes" >= 0 AND "cookMinutes" >= 0)) THEN
    ALTER TABLE "Recipe" VALIDATE CONSTRAINT "Recipe_minutes_check";
  ELSE
    RAISE WARNING 'existing "Recipe" rows break Recipe_minutes_check; it applies to new rows only until they are fixed';
  END IF;
END $$;

ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_position_check" CHECK ("position" >= 0) NOT VALID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Ingredient" WHERE NOT ("position" >= 0)) THEN
    ALTER TABLE "Ingredient" VALIDATE CONSTRAINT "Ingredient_position_check";
  ELSE
    RAISE WARNING 'existing "Ingredient" rows break Ingredient_position_check; it applies to new rows only until they are fixed';
  END IF;
END $$;

ALTER TABLE "IngredientNutrition" ADD CONSTRAINT "IngredientNutrition_source_check" CHECK ("source" IN ('STATIC','USDA','NONE')) NOT VALID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "IngredientNutrition" WHERE NOT ("source" IN ('STATIC','USDA','NONE'))) THEN
    ALTER TABLE "IngredientNutrition" VALIDATE CONSTRAINT "IngredientNutrition_source_check";
  ELSE
    RAISE WARNING 'existing "IngredientNutrition" rows break IngredientNutrition_source_check; it applies to new rows only until they are fixed';
  END IF;
END $$;

ALTER TABLE "IngredientNutrition" ADD CONSTRAINT "IngredientNutrition_macros_check" CHECK ("calories" >= 0 AND "protein" >= 0 AND "carbs" >= 0 AND "fat" >= 0) NOT VALID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "IngredientNutrition" WHERE NOT ("calories" >= 0 AND "protein" >= 0 AND "carbs" >= 0 AND "fat" >= 0)) THEN
    ALTER TABLE "IngredientNutrition" VALIDATE CONSTRAINT "IngredientNutrition_macros_check";
  ELSE
    RAISE WARNING 'existing "IngredientNutrition" rows break IngredientNutrition_macros_check; it applies to new rows only until they are fixed';
  END IF;
END $$;

ALTER TABLE "FoodProduct" ADD CONSTRAINT "FoodProduct_macros_check" CHECK ("calories" >= 0 AND "protein" >= 0 AND "carbs" >= 0 AND "fat" >= 0) NOT VALID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "FoodProduct" WHERE NOT ("calories" >= 0 AND "protein" >= 0 AND "carbs" >= 0 AND "fat" >= 0)) THEN
    ALTER TABLE "FoodProduct" VALIDATE CONSTRAINT "FoodProduct_macros_check";
  ELSE
    RAISE WARNING 'existing "FoodProduct" rows break FoodProduct_macros_check; it applies to new rows only until they are fixed';
  END IF;
END $$;

ALTER TABLE "FoodProduct" ADD CONSTRAINT "FoodProduct_servingGrams_check" CHECK ("servingGrams" > 0) NOT VALID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "FoodProduct" WHERE NOT ("servingGrams" > 0)) THEN
    ALTER TABLE "FoodProduct" VALIDATE CONSTRAINT "FoodProduct_servingGrams_check";
  ELSE
    RAISE WARNING 'existing "FoodProduct" rows break FoodProduct_servingGrams_check; it applies to new rows only until they are fixed';
  END IF;
END $$;

ALTER TABLE "UserEvent" ADD CONSTRAINT "UserEvent_type_check" CHECK ("type" IN ('search','view','grocery','chat','log','favorite','dislike','suggest')) NOT VALID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "UserEvent" WHERE NOT ("type" IN ('search','view','grocery','chat','log','favorite','dislike','suggest'))) THEN
    ALTER TABLE "UserEvent" VALIDATE CONSTRAINT "UserEvent_type_check";
  ELSE
    RAISE WARNING 'existing "UserEvent" rows break UserEvent_type_check; it applies to new rows only until they are fixed';
  END IF;
END $$;

ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_role_check" CHECK ("role" IN ('user','assistant')) NOT VALID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "ChatMessage" WHERE NOT ("role" IN ('user','assistant'))) THEN
    ALTER TABLE "ChatMessage" VALIDATE CONSTRAINT "ChatMessage_role_check";
  ELSE
    RAISE WARNING 'existing "ChatMessage" rows break ChatMessage_role_check; it applies to new rows only until they are fixed';
  END IF;
END $$;

ALTER TABLE "WaterLog" ADD CONSTRAINT "WaterLog_ml_check" CHECK ("ml" BETWEEN 1 AND 5000) NOT VALID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "WaterLog" WHERE NOT ("ml" BETWEEN 1 AND 5000)) THEN
    ALTER TABLE "WaterLog" VALIDATE CONSTRAINT "WaterLog_ml_check";
  ELSE
    RAISE WARNING 'existing "WaterLog" rows break WaterLog_ml_check; it applies to new rows only until they are fixed';
  END IF;
END $$;

ALTER TABLE "WeightEntry" ADD CONSTRAINT "WeightEntry_kg_check" CHECK ("kg" BETWEEN 20 AND 400) NOT VALID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "WeightEntry" WHERE NOT ("kg" BETWEEN 20 AND 400)) THEN
    ALTER TABLE "WeightEntry" VALIDATE CONSTRAINT "WeightEntry_kg_check";
  ELSE
    RAISE WARNING 'existing "WeightEntry" rows break WeightEntry_kg_check; it applies to new rows only until they are fixed';
  END IF;
END $$;

ALTER TABLE "User" ADD CONSTRAINT "User_sex_check" CHECK ("sex" IN ('male','female')) NOT VALID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "User" WHERE NOT ("sex" IN ('male','female'))) THEN
    ALTER TABLE "User" VALIDATE CONSTRAINT "User_sex_check";
  ELSE
    RAISE WARNING 'existing "User" rows break User_sex_check; it applies to new rows only until they are fixed';
  END IF;
END $$;

ALTER TABLE "User" ADD CONSTRAINT "User_activityLevel_check" CHECK ("activityLevel" IN ('sedentary','light','moderate','active','very_active')) NOT VALID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "User" WHERE NOT ("activityLevel" IN ('sedentary','light','moderate','active','very_active'))) THEN
    ALTER TABLE "User" VALIDATE CONSTRAINT "User_activityLevel_check";
  ELSE
    RAISE WARNING 'existing "User" rows break User_activityLevel_check; it applies to new rows only until they are fixed';
  END IF;
END $$;

ALTER TABLE "User" ADD CONSTRAINT "User_goal_check" CHECK ("goal" IN ('lose_weight','maintain','gain_weight','build_muscle')) NOT VALID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "User" WHERE NOT ("goal" IN ('lose_weight','maintain','gain_weight','build_muscle'))) THEN
    ALTER TABLE "User" VALIDATE CONSTRAINT "User_goal_check";
  ELSE
    RAISE WARNING 'existing "User" rows break User_goal_check; it applies to new rows only until they are fixed';
  END IF;
END $$;

ALTER TABLE "User" ADD CONSTRAINT "User_body_check" CHECK ("age" BETWEEN 1 AND 120 AND "heightCm" BETWEEN 50 AND 300 AND "weightKg" BETWEEN 20 AND 400) NOT VALID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "User" WHERE NOT ("age" BETWEEN 1 AND 120 AND "heightCm" BETWEEN 50 AND 300 AND "weightKg" BETWEEN 20 AND 400)) THEN
    ALTER TABLE "User" VALIDATE CONSTRAINT "User_body_check";
  ELSE
    RAISE WARNING 'existing "User" rows break User_body_check; it applies to new rows only until they are fixed';
  END IF;
END $$;

ALTER TABLE "NutritionGoals" ADD CONSTRAINT "NutritionGoals_check" CHECK ("calories" >= 0 AND "protein" >= 0 AND "carbs" >= 0 AND "fat" >= 0) NOT VALID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "NutritionGoals" WHERE NOT ("calories" >= 0 AND "protein" >= 0 AND "carbs" >= 0 AND "fat" >= 0)) THEN
    ALTER TABLE "NutritionGoals" VALIDATE CONSTRAINT "NutritionGoals_check";
  ELSE
    RAISE WARNING 'existing "NutritionGoals" rows break NutritionGoals_check; it applies to new rows only until they are fixed';
  END IF;
END $$;

ALTER TABLE "MealScanCorrection" ADD CONSTRAINT "MealScanCorrection_confirmations_check" CHECK ("confirmations" >= 0) NOT VALID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MealScanCorrection" WHERE NOT ("confirmations" >= 0)) THEN
    ALTER TABLE "MealScanCorrection" VALIDATE CONSTRAINT "MealScanCorrection_confirmations_check";
  ELSE
    RAISE WARNING 'existing "MealScanCorrection" rows break MealScanCorrection_confirmations_check; it applies to new rows only until they are fixed';
  END IF;
END $$;
