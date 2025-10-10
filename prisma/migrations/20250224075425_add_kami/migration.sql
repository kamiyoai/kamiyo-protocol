-- CreateTable
CREATE TABLE "Kami" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "japanese" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Kami_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KamiAI_42" (
    "id" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'pfn-shadow-02',
    "confidence" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "KamiAI_42_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Kami" ADD CONSTRAINT "Kami_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
