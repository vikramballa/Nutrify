-- Personal memory: usual dish portions (UserDish) and saved foods (UserFood).

-- CreateTable
CREATE TABLE "UserDish" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dishKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "calories" INTEGER NOT NULL,
    "protein" INTEGER NOT NULL,
    "carbs" INTEGER NOT NULL,
    "fat" INTEGER NOT NULL,
    "timesEaten" INTEGER NOT NULL DEFAULT 1,
    "lastEatenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFood" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "foodKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "barcode" TEXT,
    "label" JSONB,
    "usualGrams" DOUBLE PRECISION,
    "usualServings" DOUBLE PRECISION,
    "timesLogged" INTEGER NOT NULL DEFAULT 1,
    "lastLoggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserFood_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserDish_userId_lastEatenAt_idx" ON "UserDish"("userId", "lastEatenAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserDish_userId_dishKey_key" ON "UserDish"("userId", "dishKey");

-- CreateIndex
CREATE INDEX "UserFood_userId_lastLoggedAt_idx" ON "UserFood"("userId", "lastLoggedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserFood_userId_foodKey_key" ON "UserFood"("userId", "foodKey");

-- AddForeignKey
ALTER TABLE "UserDish" ADD CONSTRAINT "UserDish_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFood" ADD CONSTRAINT "UserFood_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Data rules, as for every other table (see 20261102120000_data_rules).
ALTER TABLE "UserDish" ADD CONSTRAINT "UserDish_macros_check"
  CHECK ("calories" >= 0 AND "protein" >= 0 AND "carbs" >= 0 AND "fat" >= 0 AND "timesEaten" >= 1);
ALTER TABLE "UserFood" ADD CONSTRAINT "UserFood_amounts_check"
  CHECK ("usualGrams" > 0 AND "usualServings" > 0 AND "timesLogged" >= 1);
