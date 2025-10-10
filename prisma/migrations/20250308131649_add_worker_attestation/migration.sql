/*
  Warnings:

  - You are about to drop the `kAmI_42` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "Kami" ADD COLUMN     "attestation" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'summoned',
ADD COLUMN     "workerId" TEXT;

-- DropTable
DROP TABLE "kAmI_42";

-- CreateTable
CREATE TABLE "Kami_42" (
    "id" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'pfn-shadow-02',
    "confidence" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Kami_42_pkey" PRIMARY KEY ("id")
);
