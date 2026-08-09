/**
 * HTTP-level E2E coverage for the admin-managed scooter maintenance module.
 *
 * The suite owns every scooter and maintenance type it creates. Cleanup is
 * child-first so failures never require a destructive database reset.
 */
import { INestApplication, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { v1 } from "@repo/api-shared";
import cookieParser from "cookie-parser";
import type { Server } from "node:http";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { CoreAuthService } from "../src/auth/modules/core-auth/core-auth.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { UsersService } from "../src/users/users.service";

interface IssuedSession {
  accessToken: string;
  userId: string;
}

type MaintenanceTypeKey =
  | "defaults"
  | "manual"
  | "historical"
  | "unknown"
  | "ok"
  | "dueSoon"
  | "overdue"
  | "mostUrgent";

interface MaintenanceTypeFixture {
  id: string;
  code: string;
  name: string;
  intervalKm: number | null;
  intervalMonths: number | null;
}

describe("Scooter maintenance HTTP surface (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let users: UsersService;
  let coreAuth: CoreAuthService;

  const createdUserIds: string[] = [];
  const createdScooterIds: string[] = [];
  const createdMaintenanceTypeIds: string[] = [];
  const createdBrandIds: string[] = [];
  let hondaBrand: { id: string; name: string };
  const maintenanceTypes = {} as Record<
    MaintenanceTypeKey,
    MaintenanceTypeFixture
  >;
  const runToken = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();
  let vinSeq = Math.floor(Math.random() * 7_000_000) + 1_000_000;

  const server = () => app.getHttpServer() as Server;

  type RequestBuilder = ReturnType<ReturnType<typeof request>["get"]>;
  const req = (): {
    get: (path: string) => RequestBuilder;
    post: (path: string) => RequestBuilder;
    patch: (path: string) => RequestBuilder;
  } => {
    const base = request(server());
    const tag = (builder: RequestBuilder) =>
      builder.set("x-requested-with", "fetch");
    return {
      get: (path) => tag(base.get(path)),
      post: (path) => tag(base.post(path)),
      patch: (path) => tag(base.patch(path)),
    };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.use(cookieParser());
    await app.init();

    prisma = app.get(PrismaService);
    users = app.get(UsersService);
    coreAuth = app.get(CoreAuthService);

    await createMaintenanceType("defaults", {
      name: "E2E default interval service",
      intervalKm: 2_000,
      intervalMonths: 1,
    });
    await createMaintenanceType("manual", {
      name: "E2E manually scheduled service",
      intervalKm: 5_000,
      intervalMonths: 6,
    });
    await createMaintenanceType("historical", {
      name: "E2E historical service",
      intervalKm: 1_000,
      intervalMonths: 12,
    });
    await createMaintenanceType("unknown", {
      name: "E2E unknown status service",
      intervalKm: null,
      intervalMonths: null,
    });
    await createMaintenanceType("ok", {
      name: "E2E okay status service",
      intervalKm: null,
      intervalMonths: null,
    });
    await createMaintenanceType("dueSoon", {
      name: "E2E due-soon status service",
      intervalKm: null,
      intervalMonths: null,
    });
    await createMaintenanceType("overdue", {
      name: "E2E overdue status service",
      intervalKm: null,
      intervalMonths: null,
    });
    await createMaintenanceType("mostUrgent", {
      name: "E2E most-urgent status service",
      intervalKm: null,
      intervalMonths: null,
    });

    const brand = await prisma.scooterBrand.create({
      data: { name: `Honda-${runToken}`, code: `HND${runToken.slice(-3)}` },
    });
    createdBrandIds.push(brand.id);
    hondaBrand = { id: brand.id, name: brand.name };
  });

  afterAll(async () => {
    if (prisma && createdScooterIds.length > 0) {
      await prisma.maintenanceRecord.deleteMany({
        where: { scooterId: { in: createdScooterIds } },
      });
      await prisma.scooterIssue.deleteMany({
        where: { scooterId: { in: createdScooterIds } },
      });
      await prisma.scooter.deleteMany({
        where: { id: { in: createdScooterIds } },
      });
    }
    if (prisma && createdBrandIds.length > 0) {
      await prisma.scooterBrand.deleteMany({
        where: { id: { in: createdBrandIds } },
      });
    }
    if (prisma && createdMaintenanceTypeIds.length > 0) {
      await prisma.maintenanceType.deleteMany({
        where: { id: { in: createdMaintenanceTypeIds } },
      });
    }
    if (prisma && createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await app?.close();
  });

  async function createMaintenanceType(
    key: MaintenanceTypeKey,
    input: {
      name: string;
      intervalKm: number | null;
      intervalMonths: number | null;
    },
  ): Promise<void> {
    const code = `E2E_${key.toUpperCase()}_${runToken}`;
    const row = await prisma.maintenanceType.create({
      data: {
        code,
        name: input.name,
        intervalKm: input.intervalKm,
        intervalMonths: input.intervalMonths,
      },
    });
    createdMaintenanceTypeIds.push(row.id);
    maintenanceTypes[key] = {
      id: row.id,
      code: row.code,
      name: row.name,
      intervalKm: row.intervalKm,
      intervalMonths: row.intervalMonths,
    };
  }

  async function freshSession(roles: string[]): Promise<IssuedSession> {
    const user = await users.createOne({
      email: `maintenance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      roles,
    });
    createdUserIds.push(user.id);
    const issued = await coreAuth.issueSession({ user });
    return {
      accessToken: issued.accessToken,
      userId: user.id,
    };
  }

  function authCookie(session: IssuedSession): string[] {
    return [`access_token=${session.accessToken}`];
  }

  function uniqueVin(): string {
    vinSeq += 1;
    return `LXYTCKP05P${String(vinSeq).padStart(7, "0")}`;
  }

  function scooterInput(
    overrides: Partial<v1.scooters.CreateScooterInput> = {},
  ): v1.scooters.CreateScooterInput {
    return {
      vin: uniqueVin(),
      brandId: hondaBrand.id,
      model: "PCX 125",
      manufactureYear: 2025,
      powertrainType: "combustion",
      engineCc: 125,
      ...overrides,
    };
  }

  async function createScooter(
    admin: IssuedSession,
    overrides: Partial<v1.scooters.CreateScooterInput> = {},
  ): Promise<v1.scooters.Scooter> {
    const response = await req()
      .post(v1.scooters.ROUTES.create)
      .set("Cookie", authCookie(admin))
      .send(scooterInput(overrides));
    expect(response.status).toBe(201);
    const scooter = v1.scooters.scooterSchema.parse(response.body);
    createdScooterIds.push(scooter.id);
    return scooter;
  }

  async function createRecord(
    admin: IssuedSession,
    scooterId: string,
    input: v1.maintenance.CreateMaintenanceRecordInput,
  ): Promise<v1.maintenance.MaintenanceRecord> {
    const response = await req()
      .post(v1.maintenance.ROUTES.records.create(scooterId))
      .set("Cookie", authCookie(admin))
      .send(input);
    expect(response.status).toBe(201);
    return v1.maintenance.maintenanceRecordSchema.parse(response.body);
  }

  async function getOverview(
    admin: IssuedSession,
    scooterId: string,
  ): Promise<v1.maintenance.ScooterMaintenanceOverview> {
    const response = await req()
      .get(v1.maintenance.ROUTES.overview(scooterId))
      .set("Cookie", authCookie(admin));
    expect(response.status).toBe(200);
    return v1.maintenance.scooterMaintenanceOverviewSchema.parse(response.body);
  }

  it("requires authentication and the ADMIN role", async () => {
    const unauthenticated = await req().get(v1.maintenance.ROUTES.dashboard);
    expect(unauthenticated.status).toBe(401);

    const user = await freshSession(["USER"]);
    const forbidden = await req()
      .post(v1.maintenance.ROUTES.issues.create("missing-scooter"))
      .set("Cookie", authCookie(user))
      .send({
        title: "Should be rejected before lookup",
        severity: "LOW",
      });
    expect(forbidden.status).toBe(403);
  });

  it("creates, sorts, fixes, retains, and summarizes scooter issues", async () => {
    const admin = await freshSession(["ADMIN"]);
    const scooter = await createScooter(admin);

    const lowResponse = await req()
      .post(v1.maintenance.ROUTES.issues.create(scooter.id))
      .set("Cookie", authCookie(admin))
      .send({
        title: "Loose mirror",
        description: "Left mirror vibrates at idle.",
        severity: "LOW",
      });
    expect(lowResponse.status).toBe(201);
    const low = v1.maintenance.scooterIssueSchema.parse(lowResponse.body);

    const highResponse = await req()
      .post(v1.maintenance.ROUTES.issues.create(scooter.id))
      .set("Cookie", authCookie(admin))
      .send({
        title: "Worn front brake",
        severity: "HIGH",
      });
    expect(highResponse.status).toBe(201);
    const high = v1.maintenance.scooterIssueSchema.parse(highResponse.body);
    expect(high.reportedByUserId).toBe(admin.userId);

    const criticalResponse = await req()
      .post(v1.maintenance.ROUTES.issues.create(scooter.id))
      .set("Cookie", authCookie(admin))
      .send({
        title: "Fuel leak",
        severity: "CRITICAL",
      });
    expect(criticalResponse.status).toBe(201);
    const critical = v1.maintenance.scooterIssueSchema.parse(
      criticalResponse.body,
    );

    const fixedResponse = await req()
      .post(v1.maintenance.ROUTES.issues.fix(scooter.id, high.id))
      .set("Cookie", authCookie(admin))
      .send({});
    expect(fixedResponse.status).toBe(200);
    const fixed = v1.maintenance.scooterIssueSchema.parse(fixedResponse.body);
    expect(fixed.status).toBe("FIXED");
    expect(fixed.resolvedAt).not.toBeNull();

    const listResponse = await req()
      .get(
        `${v1.maintenance.ROUTES.issues.list(scooter.id)}?page=1&pageSize=25`,
      )
      .set("Cookie", authCookie(admin));
    expect(listResponse.status).toBe(200);
    const list = v1.maintenance.scooterIssueListSchema.parse(listResponse.body);
    expect(list.total).toBe(3);
    expect(list.items.map((issue) => issue.id)).toEqual([
      critical.id,
      low.id,
      high.id,
    ]);

    const fixedListResponse = await req()
      .get(
        `${v1.maintenance.ROUTES.issues.list(scooter.id)}?status=FIXED&page=1&pageSize=25`,
      )
      .set("Cookie", authCookie(admin));
    const fixedList = v1.maintenance.scooterIssueListSchema.parse(
      fixedListResponse.body,
    );
    expect(fixedList.items.map((issue) => issue.id)).toEqual([high.id]);

    const overview = await getOverview(admin, scooter.id);
    expect(overview.openIssues.map((issue) => issue.id)).toEqual([
      critical.id,
      low.id,
    ]);
    expect(overview.issueCounts).toEqual({
      LOW: 1,
      MEDIUM: 0,
      HIGH: 0,
      CRITICAL: 1,
    });
    expect(overview.hasBlockingIssues).toBe(true);
    expect(overview.maintenanceAttentionRequired).toBe(true);
    expect(overview.recommendedOperationalStatus).toBe("UNAVAILABLE");
    expect(
      overview.activity.some(
        (item) => item.kind === "ISSUE_REPORTED" && item.issueId === high.id,
      ),
    ).toBe(true);
    expect(
      overview.activity.some(
        (item) => item.kind === "ISSUE_FIXED" && item.issueId === high.id,
      ),
    ).toBe(true);
  });

  it("copies default deadlines, honors manual overrides, and keeps mileage monotonic", async () => {
    const admin = await freshSession(["ADMIN"]);
    const scooter = await createScooter(admin, { currentMileageKm: 12_000 });

    const typesResponse = await req()
      .get(v1.maintenance.ROUTES.types.list)
      .set("Cookie", authCookie(admin));
    expect(typesResponse.status).toBe(200);
    const types = v1.maintenance.maintenanceTypeListSchema.parse(
      typesResponse.body,
    );
    expect(types.map((type) => type.id)).toContain(
      maintenanceTypes.defaults.id,
    );

    const defaultRecord = await createRecord(admin, scooter.id, {
      maintenanceTypeId: maintenanceTypes.defaults.id,
      performedAt: "2024-01-31",
      performedKm: 12_500,
      notes: "Default deadline fixture.",
    });
    expect(defaultRecord.nextDueKm).toBe(14_500);
    expect(defaultRecord.nextDueAt).toBe("2024-02-29");
    expect(defaultRecord.recordedByUserId).toBe(admin.userId);

    const manualRecord = await createRecord(admin, scooter.id, {
      maintenanceTypeId: maintenanceTypes.manual.id,
      performedAt: "2024-02-10",
      performedKm: 13_000,
      nextDueKm: 13_550,
      nextDueAt: "2024-04-01",
      notes: "Manufacturer-specific override.",
    });
    expect(manualRecord.nextDueKm).toBe(13_550);
    expect(manualRecord.nextDueAt).toBe("2024-04-01");

    const historicalRecord = await createRecord(admin, scooter.id, {
      maintenanceTypeId: maintenanceTypes.historical.id,
      performedAt: "2023-06-15",
      performedKm: 5_000,
      notes: "Imported historical invoice.",
    });

    const scooterResponse = await req()
      .get(v1.scooters.ROUTES.get(scooter.id))
      .set("Cookie", authCookie(admin));
    expect(scooterResponse.status).toBe(200);
    const updatedScooter = v1.scooters.scooterSchema.parse(
      scooterResponse.body,
    );
    expect(updatedScooter.currentMileageKm).toBe(13_000);

    const listResponse = await req()
      .get(
        `${v1.maintenance.ROUTES.records.list(scooter.id)}?page=1&pageSize=25`,
      )
      .set("Cookie", authCookie(admin));
    const records = v1.maintenance.maintenanceRecordListSchema.parse(
      listResponse.body,
    );
    expect(records.items.map((record) => record.id)).toEqual([
      manualRecord.id,
      defaultRecord.id,
      historicalRecord.id,
    ]);

    const overview = await getOverview(admin, scooter.id);
    expect(overview.currentMileageKm).toBe(13_000);
    expect(
      overview.activity.some(
        (item) =>
          item.kind === "MAINTENANCE_COMPLETED" &&
          item.maintenanceRecordId === historicalRecord.id &&
          item.performedKm === 5_000,
      ),
    ).toBe(true);
  });

  it("reports UNKNOWN, OK, DUE_SOON, OVERDUE, and the most urgent deadline", async () => {
    const admin = await freshSession(["ADMIN"]);
    const scooter = await createScooter(admin, { currentMileageKm: 10_000 });
    const performedAt = "2020-01-01";

    await createRecord(admin, scooter.id, {
      maintenanceTypeId: maintenanceTypes.ok.id,
      performedAt,
      performedKm: 9_000,
      nextDueKm: 10_301,
    });
    await createRecord(admin, scooter.id, {
      maintenanceTypeId: maintenanceTypes.dueSoon.id,
      performedAt,
      performedKm: 9_000,
      nextDueKm: 10_300,
    });
    await createRecord(admin, scooter.id, {
      maintenanceTypeId: maintenanceTypes.overdue.id,
      performedAt,
      performedKm: 9_000,
      nextDueKm: 10_000,
    });
    await createRecord(admin, scooter.id, {
      maintenanceTypeId: maintenanceTypes.mostUrgent.id,
      performedAt,
      performedKm: 9_000,
      nextDueKm: 12_000,
      nextDueAt: addUtcDaysDateOnly(-1),
    });

    const overview = await getOverview(admin, scooter.id);
    const statusByCode = new Map(
      overview.maintenanceStatuses.map((item) => [
        item.maintenanceType.code,
        item.status,
      ]),
    );
    expect(statusByCode.get(maintenanceTypes.unknown.code)).toBe("UNKNOWN");
    expect(statusByCode.get(maintenanceTypes.ok.code)).toBe("OK");
    expect(statusByCode.get(maintenanceTypes.dueSoon.code)).toBe("DUE_SOON");
    expect(statusByCode.get(maintenanceTypes.overdue.code)).toBe("OVERDUE");
    expect(statusByCode.get(maintenanceTypes.mostUrgent.code)).toBe("OVERDUE");
    expect(
      overview.dueSoonMaintenance.map((item) => item.maintenanceType.code),
    ).toContain(maintenanceTypes.dueSoon.code);
    expect(
      overview.overdueMaintenance.map((item) => item.maintenanceType.code),
    ).toEqual(
      expect.arrayContaining([
        maintenanceTypes.overdue.code,
        maintenanceTypes.mostUrgent.code,
      ]),
    );
  });

  it("lists searchable fleet issues and only the latest due schedule per active scooter", async () => {
    const admin = await freshSession(["ADMIN"]);
    const searchMarker = `Service${runToken}`;
    const criticalScooter = await createScooter(admin, {
      model: `${searchMarker} Critical`,
      currentMileageKm: 10_000,
    });
    const dueSoonScooter = await createScooter(admin, {
      model: `${searchMarker} Due Soon`,
      currentMileageKm: 10_000,
    });
    const deletedScooter = await createScooter(admin, {
      model: `${searchMarker} Deleted`,
      currentMileageKm: 10_000,
    });

    const lowResponse = await req()
      .post(v1.maintenance.ROUTES.issues.create(dueSoonScooter.id))
      .set("Cookie", authCookie(admin))
      .send({ title: "Service queue loose mirror", severity: "LOW" });
    expect(lowResponse.status).toBe(201);
    const low = v1.maintenance.scooterIssueSchema.parse(lowResponse.body);

    const criticalResponse = await req()
      .post(v1.maintenance.ROUTES.issues.create(criticalScooter.id))
      .set("Cookie", authCookie(admin))
      .send({ title: "Service queue brake failure", severity: "CRITICAL" });
    expect(criticalResponse.status).toBe(201);
    const critical = v1.maintenance.scooterIssueSchema.parse(
      criticalResponse.body,
    );

    const deletedIssueResponse = await req()
      .post(v1.maintenance.ROUTES.issues.create(deletedScooter.id))
      .set("Cookie", authCookie(admin))
      .send({ title: "Must disappear with scooter", severity: "CRITICAL" });
    expect(deletedIssueResponse.status).toBe(201);

    await createRecord(admin, criticalScooter.id, {
      maintenanceTypeId: maintenanceTypes.overdue.id,
      performedAt: "2020-01-01",
      performedKm: 9_000,
      nextDueKm: 10_000,
    });
    await createRecord(admin, dueSoonScooter.id, {
      maintenanceTypeId: maintenanceTypes.dueSoon.id,
      performedAt: "2020-01-01",
      performedKm: 8_000,
      nextDueKm: 9_000,
    });
    const latestDueSoon = await createRecord(admin, dueSoonScooter.id, {
      maintenanceTypeId: maintenanceTypes.dueSoon.id,
      performedAt: "2021-01-01",
      performedKm: 9_000,
      nextDueKm: 10_300,
    });
    await createRecord(admin, deletedScooter.id, {
      maintenanceTypeId: maintenanceTypes.overdue.id,
      performedAt: "2020-01-01",
      performedKm: 9_000,
      nextDueKm: 10_000,
    });
    await prisma.scooter.update({
      where: { id: deletedScooter.id },
      data: { deletedAt: new Date() },
    });

    const issuesResponse = await req()
      .get(
        `${v1.maintenance.ROUTES.issues.fleetList}?search=${searchMarker}&page=1&pageSize=1`,
      )
      .set("Cookie", authCookie(admin));
    expect(issuesResponse.status).toBe(200);
    const firstIssuePage = v1.maintenance.fleetIssueListSchema.parse(
      issuesResponse.body,
    );
    expect(firstIssuePage.total).toBe(2);
    expect(firstIssuePage.items.map((item) => item.issue.id)).toEqual([
      critical.id,
    ]);
    expect(firstIssuePage.items[0]?.scooter.id).toBe(criticalScooter.id);

    const lowIssuesResponse = await req()
      .get(
        `${v1.maintenance.ROUTES.issues.fleetList}?search=${searchMarker}&severity=LOW&status=OPEN`,
      )
      .set("Cookie", authCookie(admin));
    const lowIssues = v1.maintenance.fleetIssueListSchema.parse(
      lowIssuesResponse.body,
    );
    expect(lowIssues.items.map((item) => item.issue.id)).toEqual([low.id]);

    const scheduleResponse = await req()
      .get(
        `${v1.maintenance.ROUTES.schedule}?search=${searchMarker}&page=1&pageSize=25`,
      )
      .set("Cookie", authCookie(admin));
    expect(scheduleResponse.status).toBe(200);
    const schedule = v1.maintenance.serviceScheduleListSchema.parse(
      scheduleResponse.body,
    );
    expect(schedule.total).toBe(2);
    expect(schedule.items.map((item) => item.status)).toEqual([
      "OVERDUE",
      "DUE_SOON",
    ]);
    expect(schedule.items[1]?.latestRecord.id).toBe(latestDueSoon.id);

    const dueSoonResponse = await req()
      .get(
        `${v1.maintenance.ROUTES.schedule}?search=${searchMarker}&status=DUE_SOON`,
      )
      .set("Cookie", authCookie(admin));
    const dueSoonSchedule = v1.maintenance.serviceScheduleListSchema.parse(
      dueSoonResponse.body,
    );
    expect(dueSoonSchedule.total).toBe(1);
    expect(dueSoonSchedule.items[0]?.scooter.id).toBe(dueSoonScooter.id);
  });

  it("aggregates fleet attention and orders dashboard priority", async () => {
    const admin = await freshSession(["ADMIN"]);
    const baselineResponse = await req()
      .get(v1.maintenance.ROUTES.dashboard)
      .set("Cookie", authCookie(admin));
    expect(baselineResponse.status).toBe(200);
    const baseline = v1.maintenance.fleetMaintenanceDashboardSchema.parse(
      baselineResponse.body,
    );

    const criticalScooter = await createScooter(admin, {
      model: "E2E critical dashboard",
    });
    const overdueScooter = await createScooter(admin, {
      model: "E2E overdue dashboard",
      currentMileageKm: 10_000,
    });
    const dueSoonScooter = await createScooter(admin, {
      model: "E2E due-soon dashboard",
      currentMileageKm: 10_000,
    });

    const issueResponse = await req()
      .post(v1.maintenance.ROUTES.issues.create(criticalScooter.id))
      .set("Cookie", authCookie(admin))
      .send({ title: "Unsafe steering play", severity: "CRITICAL" });
    expect(issueResponse.status).toBe(201);

    await createRecord(admin, overdueScooter.id, {
      maintenanceTypeId: maintenanceTypes.overdue.id,
      performedAt: "2020-01-01",
      performedKm: 9_000,
      nextDueKm: 10_000,
    });
    await createRecord(admin, dueSoonScooter.id, {
      maintenanceTypeId: maintenanceTypes.dueSoon.id,
      performedAt: "2020-01-01",
      performedKm: 9_000,
      nextDueKm: 10_300,
    });

    const dashboardResponse = await req()
      .get(v1.maintenance.ROUTES.dashboard)
      .set("Cookie", authCookie(admin));
    expect(dashboardResponse.status).toBe(200);
    const dashboard = v1.maintenance.fleetMaintenanceDashboardSchema.parse(
      dashboardResponse.body,
    );

    expect(dashboard.totalScooters).toBe(baseline.totalScooters + 3);
    expect(dashboard.scootersWithOpenIssues).toBe(
      baseline.scootersWithOpenIssues + 1,
    );
    expect(dashboard.scootersWithBlockingIssues).toBe(
      baseline.scootersWithBlockingIssues + 1,
    );
    expect(dashboard.scootersWithOverdueMaintenance).toBe(
      baseline.scootersWithOverdueMaintenance + 1,
    );
    expect(dashboard.scootersWithMaintenanceDueSoon).toBe(
      baseline.scootersWithMaintenanceDueSoon + 1,
    );

    const criticalIndex = dashboard.requiresAttention.findIndex(
      (item) => item.id === criticalScooter.id,
    );
    const overdueIndex = dashboard.requiresAttention.findIndex(
      (item) => item.id === overdueScooter.id,
    );
    const dueSoonIndex = dashboard.requiresAttention.findIndex(
      (item) => item.id === dueSoonScooter.id,
    );
    expect(criticalIndex).toBeGreaterThanOrEqual(0);
    expect(overdueIndex).toBeGreaterThan(criticalIndex);
    expect(dueSoonIndex).toBeGreaterThan(overdueIndex);
    expect(dashboard.requiresAttention[criticalIndex]?.priorityReason).toBe(
      "CRITICAL_ISSUE",
    );
    expect(dashboard.requiresAttention[overdueIndex]?.priorityReason).toBe(
      "OVERDUE_MAINTENANCE",
    );
    expect(dashboard.requiresAttention[dueSoonIndex]?.priorityReason).toBe(
      "MAINTENANCE_DUE_SOON",
    );
  });
});

function addUtcDaysDateOnly(days: number): string {
  const now = new Date();
  const value = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days),
  );
  return value.toISOString().slice(0, 10);
}
