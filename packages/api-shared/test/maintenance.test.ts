import assert from "node:assert/strict";
import test from "node:test";

import { v1 } from "../src";

const performedAt = "2026-08-01";
const timestamp = "2026-08-01T12:30:00.000Z";

test("maintenance route builders keep every child mutation scooter-scoped", () => {
  assert.equal(v1.maintenance.ROUTES.types.list, "/v1/maintenance/types");
  assert.equal(
    v1.maintenance.ROUTES.issues.list("scooter-1"),
    "/v1/scooters/scooter-1/issues",
  );
  assert.equal(
    v1.maintenance.ROUTES.issues.create("scooter-1"),
    "/v1/scooters/scooter-1/issues",
  );
  assert.equal(
    v1.maintenance.ROUTES.issues.update("scooter-1", "issue-1"),
    "/v1/scooters/scooter-1/issues/issue-1",
  );
  assert.equal(
    v1.maintenance.ROUTES.issues.fix("scooter-1", "issue-1"),
    "/v1/scooters/scooter-1/issues/issue-1/fix",
  );
  assert.equal(
    v1.maintenance.ROUTES.issues.reopen("scooter-1", "issue-1"),
    "/v1/scooters/scooter-1/issues/issue-1/reopen",
  );
  assert.equal(
    v1.maintenance.ROUTES.records.list("scooter-1"),
    "/v1/scooters/scooter-1/maintenance-records",
  );
  assert.equal(
    v1.maintenance.ROUTES.records.create("scooter-1"),
    "/v1/scooters/scooter-1/maintenance-records",
  );
  assert.equal(
    v1.maintenance.ROUTES.records.update("scooter-1", "record-1"),
    "/v1/scooters/scooter-1/maintenance-records/record-1",
  );
  assert.equal(
    v1.maintenance.ROUTES.overview("scooter-1"),
    "/v1/scooters/scooter-1/maintenance-overview",
  );
  assert.equal(v1.maintenance.ROUTES.dashboard, "/v1/maintenance/dashboard");
  assert.equal(
    v1.maintenance.ROUTES.issues.fleetList,
    "/v1/maintenance/issues",
  );
  assert.equal(v1.maintenance.ROUTES.schedule, "/v1/maintenance/schedule");
});

test("global service queries normalize search and constrain schedule statuses", () => {
  assert.deepEqual(
    v1.maintenance.listFleetIssuesQuerySchema.parse({
      page: "2",
      pageSize: "10",
      search: "  PCX  ",
      status: "OPEN",
      severity: "HIGH",
    }),
    {
      page: 2,
      pageSize: 10,
      search: "PCX",
      status: "OPEN",
      severity: "HIGH",
    },
  );
  assert.deepEqual(v1.maintenance.listServiceScheduleQuerySchema.parse({}), {
    page: 1,
    pageSize: 25,
  });
  assert.equal(
    v1.maintenance.listServiceScheduleQuerySchema.safeParse({ status: "OK" })
      .success,
    false,
  );
  assert.equal(
    v1.maintenance.listFleetIssuesQuerySchema.safeParse({ unknown: "x" })
      .success,
    false,
  );
});

test("issue contracts accept uppercase API enums and reject unknown fields", () => {
  assert.deepEqual(
    v1.maintenance.createScooterIssueInputSchema.parse({
      title: "  Engine warning lamp  ",
      description: "  Stays on after startup  ",
      severity: "HIGH",
    }),
    {
      title: "Engine warning lamp",
      description: "Stays on after startup",
      severity: "HIGH",
    },
  );

  assert.equal(
    v1.maintenance.createScooterIssueInputSchema.safeParse({
      title: "Engine warning lamp",
      severity: "high",
    }).success,
    false,
  );
  assert.equal(
    v1.maintenance.updateScooterIssueInputSchema.safeParse({
      severity: "LOW",
      status: "FIXED",
    }).success,
    false,
  );
  assert.equal(
    v1.maintenance.fixScooterIssueInputSchema.safeParse({ reason: "done" })
      .success,
    false,
  );
  assert.equal(
    v1.maintenance.reopenScooterIssueInputSchema.safeParse({ reason: "again" })
      .success,
    false,
  );
});

test("issue and record list queries are bounded, strict, and default pagination", () => {
  assert.deepEqual(v1.maintenance.listScooterIssuesQuerySchema.parse({}), {
    page: 1,
    pageSize: 25,
  });
  assert.deepEqual(
    v1.maintenance.listScooterIssuesQuerySchema.parse({
      page: "2",
      pageSize: "50",
      status: "OPEN",
      severity: "CRITICAL",
    }),
    {
      page: 2,
      pageSize: 50,
      status: "OPEN",
      severity: "CRITICAL",
    },
  );
  assert.equal(
    v1.maintenance.listScooterIssuesQuerySchema.safeParse({ pageSize: 101 })
      .success,
    false,
  );
  assert.equal(
    v1.maintenance.listMaintenanceRecordsQuerySchema.safeParse({
      scooterId: "must-come-from-route",
    }).success,
    false,
  );
});

test("maintenance record create requires performed values and orders manual deadlines", () => {
  assert.deepEqual(
    v1.maintenance.createMaintenanceRecordInputSchema.parse({
      maintenanceTypeId: "type-engine-oil",
      performedAt,
      performedKm: 12_000,
      notes: null,
    }),
    {
      maintenanceTypeId: "type-engine-oil",
      performedAt,
      performedKm: 12_000,
      notes: null,
    },
    "omitted deadlines remain omitted so the API can calculate them",
  );

  assert.equal(
    v1.maintenance.createMaintenanceRecordInputSchema.safeParse({
      maintenanceTypeId: "type-engine-oil",
      performedAt,
    }).success,
    false,
  );
  assert.equal(
    v1.maintenance.createMaintenanceRecordInputSchema.safeParse({
      maintenanceTypeId: "type-engine-oil",
      performedAt,
      performedKm: 12_000,
      nextDueKm: 12_000,
    }).success,
    false,
  );
  assert.equal(
    v1.maintenance.createMaintenanceRecordInputSchema.safeParse({
      maintenanceTypeId: "type-engine-oil",
      performedAt,
      performedKm: 12_000,
      nextDueAt: performedAt,
    }).success,
    false,
  );
  assert.equal(
    v1.maintenance.createMaintenanceRecordInputSchema.safeParse({
      maintenanceTypeId: "type-engine-oil",
      performedAt,
      performedKm: 12_000,
      nextDueKm: null,
    }).success,
    false,
    "create uses omission, not null, to request calculated deadlines",
  );
  assert.equal(
    v1.maintenance.createMaintenanceRecordInputSchema.safeParse({
      maintenanceTypeId: "type-engine-oil",
      performedAt,
      performedKm: 12_000,
      nextDueKm: 15_000,
      nextDueAt: "2027-02-01",
    }).success,
    true,
  );
});

test("maintenance record update clears deadlines and validates complete pairs", () => {
  assert.deepEqual(
    v1.maintenance.updateMaintenanceRecordInputSchema.parse({
      nextDueKm: null,
      nextDueAt: null,
    }),
    { nextDueKm: null, nextDueAt: null },
  );
  assert.equal(
    v1.maintenance.updateMaintenanceRecordInputSchema.safeParse({
      performedKm: 15_000,
      nextDueKm: 15_000,
    }).success,
    false,
  );
  assert.equal(
    v1.maintenance.updateMaintenanceRecordInputSchema.safeParse({
      performedAt: "2026-09-01",
      nextDueAt: "2026-08-31",
    }).success,
    false,
  );
  assert.equal(
    v1.maintenance.updateMaintenanceRecordInputSchema.safeParse({
      nextDueKm: 15_000,
    }).success,
    true,
    "the API compares a lone deadline with the persisted performed value",
  );
  assert.equal(
    v1.maintenance.updateMaintenanceRecordInputSchema.safeParse({
      nextDueAt: "2026-13-01",
    }).success,
    false,
  );
});

test("overview and activity schemas preserve date-only and timestamp semantics", () => {
  const maintenanceType = maintenanceTypeFixture();
  const latestRecord = maintenanceRecordFixture(maintenanceType);
  const statusItem = {
    maintenanceType,
    latestRecord,
    status: "DUE_SOON" as const,
  };

  const parsed = v1.maintenance.scooterMaintenanceOverviewSchema.parse({
    scooterId: "scooter-1",
    currentMileageKm: 12_250,
    openIssues: [issueFixture()],
    issueCounts: { LOW: 0, MEDIUM: 0, HIGH: 1, CRITICAL: 0 },
    hasBlockingIssues: true,
    maintenanceAttentionRequired: true,
    recommendedOperationalStatus: "UNAVAILABLE",
    maintenanceStatuses: [statusItem],
    overdueMaintenance: [],
    dueSoonMaintenance: [statusItem],
    activity: [
      {
        kind: "ISSUE_REPORTED",
        occurredAt: timestamp,
        title: "Engine warning lamp",
        severity: "HIGH",
        issueId: "issue-1",
        maintenanceRecordId: null,
        performedKm: null,
      },
      {
        kind: "MAINTENANCE_COMPLETED",
        occurredAt: timestamp,
        title: "Engine oil change",
        issueId: null,
        maintenanceRecordId: "record-1",
        performedKm: 12_000,
      },
    ],
  });

  assert.equal(
    parsed.maintenanceStatuses[0]?.latestRecord?.performedAt,
    performedAt,
  );
  assert.equal(parsed.activity[1]?.kind, "MAINTENANCE_COMPLETED");
  assert.equal(
    v1.maintenance.maintenanceActivitySchema.safeParse({
      kind: "MAINTENANCE_COMPLETED",
      occurredAt: performedAt,
      title: "Engine oil change",
      issueId: null,
      maintenanceRecordId: "record-1",
      performedKm: 12_000,
    }).success,
    false,
    "activity occurredAt is an ISO timestamp, not a date-only value",
  );
});

test("scooter contracts expose mileage and list-only maintenance attention", () => {
  assert.equal(
    v1.scooters.createScooterInputSchema.safeParse({
      ...baseScooterInput(),
      currentMileageKm: -1,
    }).success,
    false,
  );
  assert.equal(
    v1.scooters.updateScooterInputSchema.parse({ currentMileageKm: null })
      .currentMileageKm,
    null,
  );

  const scooter = scooterFixture();
  assert.equal(
    v1.scooters.scooterSchema.parse(scooter).currentMileageKm,
    12_250,
  );
  assert.equal(
    v1.scooters.scooterListItemSchema.safeParse(scooter).success,
    false,
  );
  assert.equal(
    v1.scooters.scooterListItemSchema.parse({
      ...scooter,
      attentionSummary: attentionSummaryFixture(),
    }).attentionSummary.highestOpenIssueSeverity,
    "HIGH",
  );
});

test("fleet dashboard uses typed attention summaries and priority reasons", () => {
  const dashboard = v1.maintenance.fleetMaintenanceDashboardSchema.parse({
    totalScooters: 10,
    scootersWithOpenIssues: 2,
    scootersWithBlockingIssues: 1,
    scootersWithOverdueMaintenance: 1,
    scootersWithMaintenanceDueSoon: 3,
    requiresAttention: [
      {
        id: "scooter-1",
        vin: "JYARN23E0RA123456",
        brand: "Yamaha",
        model: "NMAX",
        currentMileageKm: 12_250,
        attentionSummary: attentionSummaryFixture(),
        priorityReason: "HIGH_ISSUE",
      },
    ],
  });

  assert.equal(dashboard.requiresAttention[0]?.priorityReason, "HIGH_ISSUE");
  assert.equal(
    v1.maintenance.fleetMaintenanceDashboardItemSchema.safeParse({
      ...dashboard.requiresAttention[0],
      priorityReason: "high_issue",
    }).success,
    false,
  );
});

test("global service list schemas include scooter context", () => {
  const scooter = {
    id: "scooter-1",
    vin: "JYARN23E0RA123456",
    brand: "Yamaha",
    model: "NMAX",
    currentMileageKm: 12_250,
  };
  const issueList = v1.maintenance.fleetIssueListSchema.parse({
    items: [{ issue: issueFixture(), scooter }],
    page: 1,
    pageSize: 25,
    total: 1,
  });
  expectEqual(issueList.items[0]?.scooter.vin, scooter.vin);

  const maintenanceType = maintenanceTypeFixture();
  const schedule = v1.maintenance.serviceScheduleListSchema.parse({
    items: [
      {
        scooter,
        maintenanceType,
        latestRecord: maintenanceRecordFixture(maintenanceType),
        status: "OVERDUE",
      },
    ],
    page: 1,
    pageSize: 25,
    total: 1,
  });
  expectEqual(schedule.items[0]?.status, "OVERDUE");
});

function expectEqual<T>(actual: T, expected: T): void {
  assert.equal(actual, expected);
}

function maintenanceTypeFixture() {
  return {
    id: "type-engine-oil",
    name: "Engine oil change",
    code: "ENGINE_OIL_CHANGE",
    intervalKm: 3_000,
    intervalMonths: 6,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function maintenanceRecordFixture(
  maintenanceType: ReturnType<typeof maintenanceTypeFixture>,
) {
  return {
    id: "record-1",
    scooterId: "scooter-1",
    maintenanceTypeId: maintenanceType.id,
    maintenanceType,
    performedAt,
    performedKm: 12_000,
    notes: null,
    nextDueKm: 15_000,
    nextDueAt: "2027-02-01",
    recordedByUserId: "user-1",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function issueFixture() {
  return {
    id: "issue-1",
    scooterId: "scooter-1",
    title: "Engine warning lamp",
    description: null,
    severity: "HIGH" as const,
    status: "OPEN" as const,
    reportedAt: timestamp,
    resolvedAt: null,
    reportedByUserId: "user-1",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function attentionSummaryFixture() {
  return {
    highestOpenIssueSeverity: "HIGH" as const,
    hasBlockingIssues: true,
    hasOverdueMaintenance: false,
    hasMaintenanceDueSoon: true,
    maintenanceAttentionRequired: true,
    recommendedOperationalStatus: "UNAVAILABLE" as const,
  };
}

function scooterFixture() {
  return {
    id: "scooter-1",
    vin: "JYARN23E0RA123456",
    brand: "Yamaha",
    model: "NMAX",
    color: "White",
    manufactureYear: 2026,
    powertrainType: "combustion" as const,
    engineCc: 125,
    powerKw: 9.5,
    purchasedOn: performedAt,
    registrationType: "unregistered" as const,
    plateNumber: null,
    registeredOn: null,
    registrationExpiresOn: null,
    requiredDriverLicenseType: "none" as const,
    currentMileageKm: 12_250,
    notes: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  };
}

function baseScooterInput() {
  return {
    vin: "JYARN23E0RA123456",
    brand: "Yamaha",
    model: "NMAX",
    manufactureYear: 2026,
    powertrainType: "combustion",
    engineCc: 125,
    purchasedOn: performedAt,
  };
}
