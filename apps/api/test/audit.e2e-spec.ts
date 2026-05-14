/**
 * AuditService writes one row per `record()` call. Verifies the
 * SetNull-on-user-delete cascade (audit history survives account
 * removal) end-to-end.
 */
import { Test } from "@nestjs/testing";

import { AppModule } from "../src/app.module";
import { AuditEventType } from "../src/audit/audit.types";
import { AuditService } from "../src/audit/audit.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { UsersService } from "../src/users/users.service";

describe("AuditService (e2e)", () => {
  let audit: AuditService;
  let users: UsersService;
  let prisma: PrismaService;
  const createdUserIds: string[] = [];
  const createdAuditTypes = new Set<string>();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    audit = app.get(AuditService);
    users = app.get(UsersService);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    // Only clean up audit rows we know we created.
    if (createdAuditTypes.size > 0) {
      await prisma.auditEvent.deleteMany({
        where: { type: { in: [...createdAuditTypes] } },
      });
    }
    await prisma.$disconnect();
  });

  it("record() writes a row with the expected fields", async () => {
    const uniqueType = `PR4_TEST_BASIC_${Date.now()}`;
    createdAuditTypes.add(uniqueType);

    await audit.record({
      type: uniqueType as AuditEventType,
      ip: "10.0.0.1",
      userAgent: "test-agent/1.0",
      meta: { reason: "smoke" },
    });

    const rows = await prisma.auditEvent.findMany({
      where: { type: uniqueType },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ip).toBe("10.0.0.1");
    expect(rows[0]?.userAgent).toBe("test-agent/1.0");
    expect(rows[0]?.meta).toEqual({ reason: "smoke" });
    expect(rows[0]?.userId).toBeNull();
  });

  it("survives a user delete (SetNull on userId)", async () => {
    const user = await users.createOne({
      email: `audit-user-${Date.now()}@example.com`,
    });
    createdUserIds.push(user.id);

    const uniqueType = `PR4_TEST_SURVIVE_${Date.now()}`;
    createdAuditTypes.add(uniqueType);

    await audit.record({
      type: uniqueType as AuditEventType,
      userId: user.id,
      meta: { method: "test" },
    });

    await users.deleteOne(user.id);
    // userId becomes null after deletion; the row stays.
    const after = await prisma.auditEvent.findMany({
      where: { type: uniqueType },
    });
    expect(after).toHaveLength(1);
    expect(after[0]?.userId).toBeNull();
  });

  it("uses the AuditEventType vocabulary for real flows (smoke)", async () => {
    createdAuditTypes.add(AuditEventType.LOGIN_FAIL);

    await audit.record({
      type: AuditEventType.LOGIN_FAIL,
      meta: { method: "email-otp", reason: "wrong-code" },
    });

    const row = await prisma.auditEvent.findFirst({
      where: { type: AuditEventType.LOGIN_FAIL },
      orderBy: { createdAt: "desc" },
    });
    expect(row?.meta).toMatchObject({ method: "email-otp" });
  });
});
