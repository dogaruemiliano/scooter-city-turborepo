-- Pending OTPs are intentionally discarded. They are short-lived and clients
-- can request a new challenge after deployment.
DROP TABLE IF EXISTS "OtpToken";
DROP TABLE IF EXISTS "OAuthEmailChallenge";

CREATE TABLE "OtpChallenge" (
    "id" UUID NOT NULL,
    "activeKey" TEXT,
    "channel" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "userId" TEXT,
    "provider" TEXT,
    "providerId" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "attemptsCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 1,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextSendAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OtpChallenge_oauth_context_check" CHECK (
      ("purpose" = 'AUTH' AND "provider" IS NULL AND "providerId" IS NULL)
      OR
      ("purpose" = 'OAUTH_EMAIL_VERIFY' AND "provider" IS NOT NULL AND "providerId" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "OtpChallenge_activeKey_key"
ON "OtpChallenge"("activeKey");

CREATE INDEX "OtpChallenge_channel_purpose_target_usedAt_expiresAt_idx"
ON "OtpChallenge"("channel", "purpose", "target", "usedAt", "expiresAt");

CREATE INDEX "OtpChallenge_provider_providerId_purpose_usedAt_expiresAt_idx"
ON "OtpChallenge"("provider", "providerId", "purpose", "usedAt", "expiresAt");

CREATE INDEX "OtpChallenge_userId_idx"
ON "OtpChallenge"("userId");

CREATE INDEX "OtpChallenge_expiresAt_idx"
ON "OtpChallenge"("expiresAt");

ALTER TABLE "OtpChallenge"
ADD CONSTRAINT "OtpChallenge_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
