-- Add verification logs table for analytics
CREATE TABLE IF NOT EXISTS "X402VerificationLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "responseTimeMs" INTEGER,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "X402VerificationLog_pkey" PRIMARY KEY ("id")
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS "X402VerificationLog_tenantId_idx" ON "X402VerificationLog"("tenantId");
CREATE INDEX IF NOT EXISTS "X402VerificationLog_createdAt_idx" ON "X402VerificationLog"("createdAt");
CREATE INDEX IF NOT EXISTS "X402VerificationLog_tenantId_createdAt_idx" ON "X402VerificationLog"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "X402VerificationLog_chain_idx" ON "X402VerificationLog"("chain");

-- Add foreign key
ALTER TABLE "X402VerificationLog" ADD CONSTRAINT "X402VerificationLog_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "X402Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add indexes to existing tables for better performance
CREATE INDEX IF NOT EXISTS "X402Tenant_email_idx" ON "X402Tenant"("email");
CREATE INDEX IF NOT EXISTS "X402Tenant_stripeCustomerId_idx" ON "X402Tenant"("stripeCustomerId");

CREATE INDEX IF NOT EXISTS "X402ApiKey_tenantId_idx" ON "X402ApiKey"("tenantId");
CREATE INDEX IF NOT EXISTS "X402ApiKey_keyHash_idx" ON "X402ApiKey"("keyHash");
CREATE INDEX IF NOT EXISTS "X402ApiKey_lastUsedAt_idx" ON "X402ApiKey"("lastUsedAt");
