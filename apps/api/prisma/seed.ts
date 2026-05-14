/**
 * Deterministic seed for local dev + E2E tests.
 *
 * Every row this script creates uses a fixed primary key derived from
 * its purpose, so tests can rely on stable IDs across `prisma migrate
 * reset` cycles. Idempotent: re-running upserts existing rows in place.
 *
 * NOT for production. These users exist for the sole purpose of giving
 * developers and the E2E suite known accounts to log in with. The script
 * refuses to run when NODE_ENV=production.
 *
 * Uses Prisma 7's canonical setup per AGENTS.md → prisma-verify-rule:
 *   - PrismaClient comes from `../src/generated/prisma/client`
 *     (not `@prisma/client` — that import path is empty in v7)
 *   - Connection goes through PrismaPg driver adapter with explicit pool
 *     settings (pg's defaults differ from what Prisma 6 used)
 *
 * Users created:
 *
 *   | Email                          | Purpose                       | Notes                               |
 *   |--------------------------------|-------------------------------|-------------------------------------|
 *   | test-email-otp@example.com     | Email-OTP flow                | no OAuth links                      |
 *   | test-sms@example.com           | SMS-OTP flow                  | phone +40700000001                  |
 *   | test-google@example.com        | Google OAuth                  | linked AuthAccount row              |
 *   | test-apple@example.com         | Apple OAuth                   | linked AuthAccount row, email saved |
 *
 * Run via `pnpm db:seed` (which calls `prisma db seed` → `tsx prisma/seed.ts`).
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

if (process.env.NODE_ENV === "production") {
  // eslint-disable-next-line no-console
  console.error(
    "Refusing to seed test users in production. This seed exists only for local dev and E2E tests.",
  );
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

const prisma = new PrismaClient({ adapter });

const FIXED_IDS = {
  emailOtp: "seed-user-email-otp",
  sms: "seed-user-sms",
  google: "seed-user-google",
  apple: "seed-user-apple",
} as const;

async function main(): Promise<void> {
  const now = new Date();

  // Email-OTP user — no OAuth links.
  await prisma.user.upsert({
    where: { id: FIXED_IDS.emailOtp },
    create: {
      id: FIXED_IDS.emailOtp,
      email: "test-email-otp@example.com",
      firstName: "Test",
      lastName: "EmailOtp",
    },
    update: {},
  });

  // SMS-OTP user — has phone, no email-verified.
  await prisma.user.upsert({
    where: { id: FIXED_IDS.sms },
    create: {
      id: FIXED_IDS.sms,
      email: "test-sms@example.com",
      phone: "+40700000001",
      firstName: "Test",
      lastName: "Sms",
    },
    update: { phone: "+40700000001" },
  });

  // OAuth-linked users — one AuthAccount row each.
  const oauthSeeds = [
    {
      id: FIXED_IDS.google,
      email: "test-google@example.com",
      provider: "google" as const,
      providerId: "seed-google-sub-001",
    },
    {
      id: FIXED_IDS.apple,
      email: "test-apple@example.com",
      provider: "apple" as const,
      providerId: "seed-apple-sub-001",
    },
  ];

  for (const seed of oauthSeeds) {
    await prisma.user.upsert({
      where: { id: seed.id },
      create: {
        id: seed.id,
        email: seed.email,
        emailVerified: now,
        firstName: "Test",
        lastName:
          seed.provider.charAt(0).toUpperCase() + seed.provider.slice(1),
      },
      update: { emailVerified: now },
    });

    await prisma.authAccount.upsert({
      where: {
        provider_providerId: {
          provider: seed.provider,
          providerId: seed.providerId,
        },
      },
      create: {
        provider: seed.provider,
        providerId: seed.providerId,
        userId: seed.id,
        email: seed.email,
      },
      update: { email: seed.email },
    });
  }

  // eslint-disable-next-line no-console
  console.log(`Seeded ${Object.keys(FIXED_IDS).length} users.`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
