-- AlterTable (a constant default: no table rewrite)
ALTER TABLE "Recipe" ADD COLUMN "qualityScore" INTEGER NOT NULL DEFAULT 0;
