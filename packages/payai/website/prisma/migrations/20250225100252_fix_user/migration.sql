/*
  Warnings:

  - You are about to drop the `KamiAI_42` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "KamiAI_42";

-- CreateTable
CREATE TABLE "kAmI_42" (
    "id" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'pfn-shadow-02',
    "confidence" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "kAmI_42_pkey" PRIMARY KEY ("id")
);
