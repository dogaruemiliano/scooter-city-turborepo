/**
 * Timing-attack sanity checks for `CoreAuthService`.
 *
 * These are statistical tests with deliberately broad bounds. The goal
 * is to catch egregious regressions ("dummy compare was deleted", "jti
 * lookup was short-circuited") rather than to PROVE no timing channel
 * exists. CI machines have noisy clocks; tight bounds would flake.
 *
 * Specific timing channels analyzed:
 *
 * - **JWT signature failure path** — fails before any DB call. Faster
 *   than "valid sig, unknown jti", but an attacker can't forge a valid
 *   signature without the refresh secret. Not exploitable.
 * - **Unknown vs known-revoked jti** — known-revoked triggers
 *   burn-session writes; unknown returns after lookup. Different but
 *   the jti space (UUIDv4, 2^122) is unenumerable in practice.
 * - **Hash mismatch on active row** — same write path as success
 *   (burnSession). Constant-time via `safeEqualHex` →
 *   `timingSafeEqual`.
 * - **`performDummyHashCompare`** — defensive primitive for future
 *   credentials/OTP modules. Must take meaningful time so "no such
 *   user" can't be distinguished from "wrong password" by wall-clock.
 *
 * Read [docs/auth/refresh-rotation.md](../../../docs/auth/refresh-rotation.md)
 * for the full algorithm.
 */
import { JwtModule } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";

import { ConfigModule } from "../src/config/config.module";
import { PrismaModule } from "../src/prisma/prisma.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { UsersModule } from "../src/users/users.module";
import { UsersService } from "../src/users/users.service";
import { CoreAuthService } from "../src/auth/modules/core-auth/core-auth.service";

async function timeMs(fn: () => Promise<unknown>): Promise<number> {
  const start = performance.now();
  try {
    await fn();
  } catch {
    // ignore — we're measuring wall-clock, not asserting on outcome
  }
  return performance.now() - start;
}

async function meanMs(
  fn: () => Promise<unknown>,
  samples = 10,
): Promise<number> {
  let total = 0;
  for (let i = 0; i < samples; i++) total += await timeMs(fn);
  return total / samples;
}

describe("CoreAuthService timing channels (e2e)", () => {
  let coreAuth: CoreAuthService;
  let users: UsersService;
  let prisma: PrismaService;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule,
        PrismaModule,
        UsersModule,
        JwtModule.register({}),
      ],
      providers: [CoreAuthService],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    coreAuth = app.get(CoreAuthService);
    users = app.get(UsersService);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  it("performDummyHashCompare actually does the bcrypt work (≥ 20ms)", async () => {
    const mean = await meanMs(() => coreAuth.performDummyHashCompare(), 5);
    expect(mean).toBeGreaterThanOrEqual(20);
  });

  it("rotateTokens with valid-signature unknown-jti hits the DB (≥ 1ms, NOT an instant fail)", async () => {
    // Build a forged but signature-valid refresh token. If the service
    // were short-circuiting on "no row" before the DB lookup, this would
    // return in microseconds; the lookup forces a roundtrip.
    const svc = coreAuth as unknown as {
      env: { JWT_REFRESH_SECRET: string };
      jwt: {
        sign: (
          claims: object,
          opts: { secret: string; expiresIn: number },
        ) => string;
      };
    };
    const fake = svc.jwt.sign(
      { sub: "ghost", sid: "ghost", jti: "ghost-jti-not-in-db" },
      { secret: svc.env.JWT_REFRESH_SECRET, expiresIn: 60 },
    );

    const mean = await meanMs(() => coreAuth.rotateTokens(fake), 5);
    expect(mean).toBeGreaterThanOrEqual(1);
  });

  it("hash-mismatch (burn path) is within 10x of the success path on average", async () => {
    // Success path baseline: create user, issue session, rotate happy.
    const successMean = await meanMs(async () => {
      const user = await users.createOne({
        email: `timing-${Date.now()}-${Math.random()}@example.com`,
      });
      createdUserIds.push(user.id);
      const issued = await coreAuth.issueSession({ user });
      await coreAuth.rotateTokens(issued.refreshToken);
    }, 3);

    // Burn path: same setup but tamper the row's tokenHash so the
    // bcrypt-style hash compare fails inside rotateTokens.
    const burnMean = await meanMs(async () => {
      const user = await users.createOne({
        email: `timing-burn-${Date.now()}-${Math.random()}@example.com`,
      });
      createdUserIds.push(user.id);
      const issued = await coreAuth.issueSession({ user });
      // Corrupt the stored hash so safeEqualHex returns false → burn path.
      await prisma.refreshToken.updateMany({
        where: { sessionId: issued.sessionId },
        data: { tokenHash: "0".repeat(64) },
      });
      await coreAuth.rotateTokens(issued.refreshToken).catch(() => undefined);
    }, 3);

    // Broad bound — burn path involves slightly different writes (revoke
    // refresh rows + revoke session) than the success path (mint + insert
    // + revoke old + bump lastUsed). They should be within an order of
    // magnitude of each other; if burn is 50x slower we'd worry.
    expect(burnMean).toBeLessThan(successMean * 10);
    expect(successMean).toBeLessThan(burnMean * 10);
  });
});
