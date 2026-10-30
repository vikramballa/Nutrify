-- CreateEnum
CREATE TYPE "RecipeSource" AS ENUM ('MEALDB', 'AI');

-- CreateTable
CREATE TABLE "GroceryItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroceryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "measure" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionGoals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "calories" INTEGER NOT NULL DEFAULT 980,
    "carbs" INTEGER NOT NULL DEFAULT 44,
    "protein" INTEGER NOT NULL DEFAULT 81,
    "fat" INTEGER NOT NULL DEFAULT 18,

    CONSTRAINT "NutritionGoals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "nameLower" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "cuisine" TEXT NOT NULL,
    "imageUrl" TEXT,
    "instructions" TEXT NOT NULL,
    "prepMinutes" INTEGER,
    "cookMinutes" INTEGER,
    "source" "RecipeSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeInsight" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchTerm" (
    "id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,

    CONSTRAINT "SearchTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Sarah',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NutritionGoals_userId_key" ON "NutritionGoals"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_externalId_key" ON "Recipe"("externalId" ASC);

-- CreateIndex
CREATE INDEX "Recipe_nameLower_idx" ON "Recipe"("nameLower" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "RecipeInsight_recipeId_key" ON "RecipeInsight"("recipeId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SearchTerm_term_key" ON "SearchTerm"("term" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_deviceId_key" ON "User"("deviceId" ASC);

-- AddForeignKey
ALTER TABLE "GroceryItem" ADD CONSTRAINT "GroceryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionGoals" ADD CONSTRAINT "NutritionGoals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeInsight" ADD CONSTRAINT "RecipeInsight_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchTerm" ADD CONSTRAINT "SearchTerm_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

