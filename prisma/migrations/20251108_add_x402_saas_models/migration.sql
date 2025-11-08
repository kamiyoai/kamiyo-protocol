-- CreateTable
CREATE TABLE "X402Tenant" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "companyName" TEXT,
    "tier" TEXT NOT NULL DEFAULT 'free',
    "status" TEXT NOT NULL DEFAULT 'active',
    "solanaPaymentAddress" TEXT NOT NULL,
    "basePaymentAddress" TEXT NOT NULL,
    "ethereumPaymentAddress" TEXT NOT NULL,
    "monthlyVerificationLimit" INTEGER NOT NULL DEFAULT 1000,
    "monthlyVerificationsUsed" INTEGER NOT NULL DEFAULT 0,
    "quotaResetDate" TIMESTAMP(3),
    "enabledChains" TEXT NOT NULL DEFAULT '["solana","base"]',
    "payaiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "customBranding" BOOLEAN NOT NULL DEFAULT false,
    "webhooksEnabled" BOOLEAN NOT NULL DEFAULT false,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "X402Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "X402ApiKey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "name" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'live',
    "scopes" TEXT NOT NULL DEFAULT '["verify","settle","analytics"]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "X402ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "X402Verification" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "amountUsdc" DECIMAL(18,6),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "apiKeyId" TEXT,
    "ipAddress" TEXT,
    "responseTimeMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "X402Verification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "X402Tenant_email_key" ON "X402Tenant"("email");

-- CreateIndex
CREATE UNIQUE INDEX "X402Tenant_solanaPaymentAddress_key" ON "X402Tenant"("solanaPaymentAddress");

-- CreateIndex
CREATE UNIQUE INDEX "X402Tenant_basePaymentAddress_key" ON "X402Tenant"("basePaymentAddress");

-- CreateIndex
CREATE UNIQUE INDEX "X402Tenant_ethereumPaymentAddress_key" ON "X402Tenant"("ethereumPaymentAddress");

-- CreateIndex
CREATE UNIQUE INDEX "X402Tenant_stripeCustomerId_key" ON "X402Tenant"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "X402Tenant_email_idx" ON "X402Tenant"("email");

-- CreateIndex
CREATE INDEX "X402Tenant_tier_idx" ON "X402Tenant"("tier");

-- CreateIndex
CREATE INDEX "X402Tenant_status_idx" ON "X402Tenant"("status");

-- CreateIndex
CREATE UNIQUE INDEX "X402ApiKey_keyHash_key" ON "X402ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "X402ApiKey_tenantId_idx" ON "X402ApiKey"("tenantId");

-- CreateIndex
CREATE INDEX "X402ApiKey_keyHash_idx" ON "X402ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "X402ApiKey_isActive_idx" ON "X402ApiKey"("isActive");

-- CreateIndex
CREATE INDEX "X402Verification_tenantId_idx" ON "X402Verification"("tenantId");

-- CreateIndex
CREATE INDEX "X402Verification_txHash_idx" ON "X402Verification"("txHash");

-- CreateIndex
CREATE INDEX "X402Verification_chain_idx" ON "X402Verification"("chain");

-- CreateIndex
CREATE INDEX "X402Verification_createdAt_idx" ON "X402Verification"("createdAt");

-- AddForeignKey
ALTER TABLE "X402ApiKey" ADD CONSTRAINT "X402ApiKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "X402Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "X402Verification" ADD CONSTRAINT "X402Verification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "X402Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
