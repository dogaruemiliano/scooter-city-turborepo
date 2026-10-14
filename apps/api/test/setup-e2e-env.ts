// Runs before setup-env.ts can supply the unit-test defaults. E2E tests write
// real data, so a missing/filtered URL must never select the development DB.
if (!process.env.DATABASE_URL?.trim()) {
  throw new Error(
    "E2E tests require an explicit DATABASE_URL pointing to a disposable test database. Configure apps/api/.env.test and use pnpm test:e2e to prepare databases and run Jest.",
  );
}

export {};
