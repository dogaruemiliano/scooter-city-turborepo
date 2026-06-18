-- CreateTable
CREATE TABLE "OAuthEmailChallenge" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attemptsCount" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthEmailChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OAuthEmailChallenge_provider_providerId_usedAt_expiresAt_idx"
ON "OAuthEmailChallenge"("provider", "providerId", "usedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "OAuthEmailChallenge_expiresAt_idx"
ON "OAuthEmailChallenge"("expiresAt");
