import type { DynamicModule, Type } from "@nestjs/common";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { ScheduleModule } from "@nestjs/schedule";
import { AppModule } from "./app.module";
import { AuthModule } from "./auth/auth.module";
import { AuthCleanupService } from "./auth/cleanup/auth-cleanup.service";

function schedulerRegistrations(root: Type<unknown> | DynamicModule): number {
  const seen = new Set<unknown>();
  function visit(entry: unknown): number {
    if (!entry || seen.has(entry)) return 0;
    seen.add(entry);
    if (typeof entry === "function") {
      const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, entry) as
        | unknown[]
        | undefined;
      return (imports ?? []).reduce<number>(
        (count, child) => count + visit(child),
        0,
      );
    }
    if (typeof entry !== "object" || !("module" in entry)) return 0;
    const dynamic = entry as DynamicModule;
    return (
      (dynamic.module === ScheduleModule ? 1 : 0) +
      visit(dynamic.module) +
      (dynamic.imports ?? []).reduce<number>(
        (count, child) => count + visit(child),
        0,
      )
    );
  }
  return visit(root);
}

it("registers application cron handlers once, regardless of the auth cleanup flag", () => {
  expect(schedulerRegistrations(AppModule)).toBe(1);
  for (const enabled of [true, false]) {
    const auth = AuthModule.forRoot({
      cleanup: { enabled },
      enabledMethods: [],
    });
    expect(schedulerRegistrations(auth)).toBe(0);
    expect(auth.providers?.includes(AuthCleanupService)).toBe(enabled);
  }
});
