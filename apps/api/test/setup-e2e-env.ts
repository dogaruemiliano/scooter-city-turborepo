import { ScheduleModule } from "@nestjs/schedule";

// Runs before setup-env.ts can supply the unit-test defaults. E2E tests write
// real data, so a missing/filtered URL must never select the development DB.
if (!process.env.DATABASE_URL?.trim()) {
  throw new Error(
    "E2E tests require an explicit DATABASE_URL pointing to a disposable test database. Configure apps/api/.env.test and use pnpm test:e2e to prepare databases and run Jest.",
  );
}

// HTTP suites own their database fixtures and teardown. Scheduled dispatchers
// must not consume those fixtures or keep queries running after app.close().
// Worker regressions invoke their handlers explicitly instead.
const forRoot = ScheduleModule.forRoot.bind(
  ScheduleModule,
) as typeof ScheduleModule.forRoot;
jest
  .spyOn(ScheduleModule, "forRoot")
  .mockImplementation((options) =>
    forRoot({ ...options, cronJobs: false, intervals: false, timeouts: false }),
  );
