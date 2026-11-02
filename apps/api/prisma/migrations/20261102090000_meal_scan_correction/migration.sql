-- CreateTable
CREATE TABLE "MealScanCorrection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "predictedKey" TEXT NOT NULL,
    "predictedName" TEXT NOT NULL,
    "correctName" TEXT NOT NULL,
    "confirmations" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealScanCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MealScanCorrection_userId_updatedAt_idx" ON "MealScanCorrection"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MealScanCorrection_userId_predictedKey_key" ON "MealScanCorrection"("userId", "predictedKey");

-- AddForeignKey
ALTER TABLE "MealScanCorrection" ADD CONSTRAINT "MealScanCorrection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
