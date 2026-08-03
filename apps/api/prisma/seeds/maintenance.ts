import type { PrismaClient } from "../../src/generated/prisma/client";

type MaintenanceTypeSeed = {
  id: string;
  code: string;
  name: string;
  intervalKm: number | null;
  intervalMonths: number | null;
};

/**
 * Conservative starting points for a mixed small-scooter fleet.
 *
 * These values are editable configuration, not a replacement for each
 * scooter's manufacturer service schedule. A null interval means the item is
 * model-specific or condition-based and must be scheduled after inspection;
 * it does not mean that the item requires no maintenance.
 */
const MAINTENANCE_TYPE_SEEDS = [
  {
    id: "seed-maintenance-type-engine-oil-change",
    code: "ENGINE_OIL_CHANGE",
    name: "Engine oil change",
    intervalKm: 2_000,
    intervalMonths: 6,
  },
  {
    id: "seed-maintenance-type-transmission-oil-change",
    code: "TRANSMISSION_OIL_CHANGE",
    name: "Transmission oil change",
    intervalKm: 6_000,
    intervalMonths: 12,
  },
  {
    id: "seed-maintenance-type-spark-plug",
    code: "SPARK_PLUG",
    name: "Spark plug",
    intervalKm: 6_000,
    intervalMonths: 12,
  },
  {
    id: "seed-maintenance-type-air-filter",
    code: "AIR_FILTER",
    name: "Air filter",
    intervalKm: 4_000,
    intervalMonths: 12,
  },
  {
    id: "seed-maintenance-type-fuel-filter",
    code: "FUEL_FILTER",
    name: "Fuel filter",
    intervalKm: null,
    intervalMonths: null,
  },
  {
    id: "seed-maintenance-type-cvt-belt",
    code: "CVT_BELT",
    name: "CVT belt",
    intervalKm: 10_000,
    intervalMonths: 24,
  },
  {
    id: "seed-maintenance-type-variator-rollers",
    code: "VARIATOR_ROLLERS",
    name: "Variator rollers",
    intervalKm: 8_000,
    intervalMonths: 24,
  },
  {
    id: "seed-maintenance-type-variator",
    code: "VARIATOR",
    name: "Variator",
    intervalKm: null,
    intervalMonths: null,
  },
  {
    id: "seed-maintenance-type-clutch",
    code: "CLUTCH",
    name: "Clutch",
    intervalKm: null,
    intervalMonths: null,
  },
  {
    id: "seed-maintenance-type-front-brake-pads",
    code: "FRONT_BRAKE_PADS",
    name: "Front brake pads",
    intervalKm: null,
    intervalMonths: null,
  },
  {
    id: "seed-maintenance-type-rear-brake-pads",
    code: "REAR_BRAKE_PADS",
    name: "Rear brake pads",
    intervalKm: null,
    intervalMonths: null,
  },
  {
    id: "seed-maintenance-type-brake-fluid",
    code: "BRAKE_FLUID",
    name: "Brake fluid",
    intervalKm: null,
    intervalMonths: 24,
  },
  {
    id: "seed-maintenance-type-battery",
    code: "BATTERY",
    name: "Battery",
    intervalKm: null,
    intervalMonths: null,
  },
  {
    id: "seed-maintenance-type-front-tyre",
    code: "FRONT_TYRE",
    name: "Front tyre",
    intervalKm: null,
    intervalMonths: null,
  },
  {
    id: "seed-maintenance-type-rear-tyre",
    code: "REAR_TYRE",
    name: "Rear tyre",
    intervalKm: null,
    intervalMonths: null,
  },
] as const satisfies readonly MaintenanceTypeSeed[];

type MaintenanceTypeCode = (typeof MAINTENANCE_TYPE_SEEDS)[number]["code"];

type DemoIssueSeed = {
  id: string;
  scooterId: string;
  title: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "FIXED";
  reportedAt: Date;
  resolvedAt: Date | null;
};

type DemoMaintenanceRecordSeed = {
  id: string;
  scooterId: string;
  maintenanceTypeCode: MaintenanceTypeCode;
  performedAt: Date;
  performedKm: number;
  notes: string;
  nextDueKm: number | null;
  nextDueAt: Date | null;
};

const DEMO_SCOOTERS = [
  { id: "seed-scooter-generated-0001", minimumMileageKm: 12_000 },
  { id: "seed-scooter-generated-0002", minimumMileageKm: 6_000 },
  { id: "seed-scooter-generated-0003", minimumMileageKm: 7_500 },
  { id: "seed-scooter-generated-0004", minimumMileageKm: 3_200 },
  { id: "seed-scooter-generated-0005", minimumMileageKm: 10_000 },
  { id: "seed-scooter-generated-0006", minimumMileageKm: 10_000 },
] as const;

const DEMO_MAINTENANCE_TYPE_CODES = [
  "ENGINE_OIL_CHANGE",
  "AIR_FILTER",
  "BRAKE_FLUID",
  "FUEL_FILTER",
  "SPARK_PLUG",
  "TRANSMISSION_OIL_CHANGE",
] as const satisfies readonly MaintenanceTypeCode[];

const DEMO_ACTOR_USER_ID = "seed-user-admin";

export async function seedMaintenance(prisma: PrismaClient): Promise<void> {
  for (const maintenanceType of MAINTENANCE_TYPE_SEEDS) {
    await prisma.maintenanceType.upsert({
      where: { code: maintenanceType.code },
      create: {
        ...maintenanceType,
        isActive: true,
      },
      // These rows become operator-managed configuration after first insert.
      // Re-seeding must preserve edited intervals, names, and active status.
      update: {},
    });
  }

  await seedMaintenanceDemoData(prisma);
}

/**
 * Seeds local-only repair scenarios on six reserved generated scooters.
 *
 * The rows use stable IDs, so reruns update only fixture-owned history. Due
 * states are mileage-driven where possible, while relative UTC dates keep the
 * date-only status branch and timeline recent. Existing mileage is never
 * reduced if a developer has already exercised one of these scooters.
 */
async function seedMaintenanceDemoData(prisma: PrismaClient): Promise<void> {
  const [scooters, maintenanceTypes, actor] = await Promise.all([
    prisma.scooter.findMany({
      where: {
        id: { in: DEMO_SCOOTERS.map(({ id }) => id) },
        deletedAt: null,
      },
      select: { id: true, currentMileageKm: true },
    }),
    prisma.maintenanceType.findMany({
      where: { code: { in: [...DEMO_MAINTENANCE_TYPE_CODES] } },
      select: { id: true, code: true },
    }),
    prisma.user.findUnique({
      where: { id: DEMO_ACTOR_USER_ID },
      select: { id: true },
    }),
  ]);

  if (scooters.length !== DEMO_SCOOTERS.length) {
    const foundIds = new Set(scooters.map(({ id }) => id));
    const missingIds = DEMO_SCOOTERS.filter(({ id }) => !foundIds.has(id)).map(
      ({ id }) => id,
    );
    throw new Error(
      `Maintenance demo seed requires active scooters: ${missingIds.join(", ")}`,
    );
  }

  const maintenanceTypeIds = new Map(
    maintenanceTypes.map(({ code, id }) => [code, id]),
  );
  const missingTypeCodes = DEMO_MAINTENANCE_TYPE_CODES.filter(
    (code) => !maintenanceTypeIds.has(code),
  );
  if (missingTypeCodes.length > 0) {
    throw new Error(
      `Maintenance demo seed requires maintenance types: ${missingTypeCodes.join(", ")}`,
    );
  }

  const existingMileageByScooterId = new Map(
    scooters.map(({ id, currentMileageKm }) => [id, currentMileageKm]),
  );
  const mileageByScooterId = new Map(
    DEMO_SCOOTERS.map(({ id, minimumMileageKm }) => [
      id,
      Math.max(existingMileageByScooterId.get(id) ?? 0, minimumMileageKm),
    ]),
  );
  const seedDay = utcDay(new Date());
  const issues = buildDemoIssues(seedDay);
  const records = buildDemoMaintenanceRecords(seedDay, mileageByScooterId);
  const actorUserId = actor?.id ?? null;

  await prisma.$transaction(async (tx) => {
    for (const { id } of DEMO_SCOOTERS) {
      await tx.scooter.update({
        where: { id },
        data: { currentMileageKm: requiredMileage(mileageByScooterId, id) },
      });
    }

    for (const issue of issues) {
      const data = {
        scooterId: issue.scooterId,
        title: issue.title,
        description: issue.description,
        severity: issue.severity,
        status: issue.status,
        reportedAt: issue.reportedAt,
        resolvedAt: issue.resolvedAt,
        reportedByUserId: actorUserId,
        createdAt: issue.reportedAt,
        updatedAt: issue.resolvedAt ?? issue.reportedAt,
      };
      await tx.scooterIssue.upsert({
        where: { id: issue.id },
        create: { id: issue.id, ...data },
        update: data,
      });
    }

    for (const record of records) {
      const maintenanceTypeId = maintenanceTypeIds.get(
        record.maintenanceTypeCode,
      );
      if (!maintenanceTypeId) {
        throw new Error(
          `Maintenance type ${record.maintenanceTypeCode} disappeared during seeding.`,
        );
      }
      const data = {
        scooterId: record.scooterId,
        maintenanceTypeId,
        performedAt: record.performedAt,
        performedKm: record.performedKm,
        notes: record.notes,
        nextDueKm: record.nextDueKm,
        nextDueAt: record.nextDueAt,
        recordedByUserId: actorUserId,
        createdAt: record.performedAt,
        updatedAt: record.performedAt,
      };
      await tx.maintenanceRecord.upsert({
        where: { id: record.id },
        create: { id: record.id, ...data },
        update: data,
      });
    }
  });

  console.log(
    `Seeded ${issues.length} scooter repair issues and ${records.length} maintenance records across ${DEMO_SCOOTERS.length} demo scooters.`,
  );
}

function buildDemoIssues(seedDay: Date): DemoIssueSeed[] {
  return [
    {
      id: "seed-scooter-issue-0001-critical",
      scooterId: "seed-scooter-generated-0001",
      title: "Front brake pressure loss",
      description:
        "Brake lever reaches the handlebar under firm pressure. Keep unavailable until inspected.",
      severity: "CRITICAL",
      status: "OPEN",
      reportedAt: utcDateAtOffset(seedDay, -2, 8, 30),
      resolvedAt: null,
    },
    {
      id: "seed-scooter-issue-0001-fixed",
      scooterId: "seed-scooter-generated-0001",
      title: "Rear indicator intermittently fails",
      description: "Connector cleaned and bulb replaced during inspection.",
      severity: "MEDIUM",
      status: "FIXED",
      reportedAt: utcDateAtOffset(seedDay, -15, 9),
      resolvedAt: utcDateAtOffset(seedDay, -14, 16, 30),
    },
    {
      id: "seed-scooter-issue-0002-high",
      scooterId: "seed-scooter-generated-0002",
      title: "Steering head play",
      description:
        "Noticeable movement under braking; remove from rental rotation.",
      severity: "HIGH",
      status: "OPEN",
      reportedAt: utcDateAtOffset(seedDay, -3, 10, 15),
      resolvedAt: null,
    },
    {
      id: "seed-scooter-issue-0003-medium",
      scooterId: "seed-scooter-generated-0003",
      title: "Intermittent electric starter",
      description: "Starter occasionally needs a second attempt when cold.",
      severity: "MEDIUM",
      status: "OPEN",
      reportedAt: utcDateAtOffset(seedDay, -4, 12),
      resolvedAt: null,
    },
    {
      id: "seed-scooter-issue-0004-low",
      scooterId: "seed-scooter-generated-0004",
      title: "Left mirror vibrates",
      description: "Mirror remains usable but should be tightened at service.",
      severity: "LOW",
      status: "OPEN",
      reportedAt: utcDateAtOffset(seedDay, -5, 15, 45),
      resolvedAt: null,
    },
  ];
}

function buildDemoMaintenanceRecords(
  seedDay: Date,
  mileageByScooterId: ReadonlyMap<string, number>,
): DemoMaintenanceRecordSeed[] {
  const scooterOneMileage = requiredMileage(
    mileageByScooterId,
    "seed-scooter-generated-0001",
  );
  const scooterFiveMileage = requiredMileage(
    mileageByScooterId,
    "seed-scooter-generated-0005",
  );
  const scooterSixMileage = requiredMileage(
    mileageByScooterId,
    "seed-scooter-generated-0006",
  );

  return [
    {
      id: "seed-maintenance-record-0001-engine-oil-old",
      scooterId: "seed-scooter-generated-0001",
      maintenanceTypeCode: "ENGINE_OIL_CHANGE",
      performedAt: utcDateAtOffset(seedDay, -200),
      performedKm: Math.max(0, scooterOneMileage - 4_000),
      notes:
        "Older oil-change fixture retained to prove that the latest record wins.",
      nextDueKm: Math.max(1, scooterOneMileage - 2_000),
      nextDueAt: utcDateAtOffset(seedDay, -20),
    },
    {
      id: "seed-maintenance-record-0001-engine-oil-latest",
      scooterId: "seed-scooter-generated-0001",
      maintenanceTypeCode: "ENGINE_OIL_CHANGE",
      performedAt: utcDateAtOffset(seedDay, -20),
      performedKm: Math.max(0, scooterOneMileage - 500),
      notes: "Latest engine oil and filter change; normal default interval.",
      nextDueKm: scooterOneMileage + 2_000,
      nextDueAt: utcDateAtOffset(seedDay, 160),
    },
    {
      id: "seed-maintenance-record-0001-air-filter",
      scooterId: "seed-scooter-generated-0001",
      maintenanceTypeCode: "AIR_FILTER",
      performedAt: utcDateAtOffset(seedDay, -90),
      performedKm: Math.max(0, scooterOneMileage - 3_750),
      notes: "Air filter replacement due soon by mileage.",
      nextDueKm: scooterOneMileage + 250,
      nextDueAt: utcDateAtOffset(seedDay, 275),
    },
    {
      id: "seed-maintenance-record-0001-brake-fluid",
      scooterId: "seed-scooter-generated-0001",
      maintenanceTypeCode: "BRAKE_FLUID",
      performedAt: utcDateAtOffset(seedDay, -120),
      performedKm: Math.max(0, scooterOneMileage - 3_000),
      notes: "Manual early inspection deadline (operator override).",
      nextDueKm: null,
      nextDueAt: utcDateAtOffset(seedDay, -7),
    },
    {
      id: "seed-maintenance-record-0001-fuel-filter",
      scooterId: "seed-scooter-generated-0001",
      maintenanceTypeCode: "FUEL_FILTER",
      performedAt: utcDateAtOffset(seedDay, -30),
      performedKm: Math.max(0, scooterOneMileage - 800),
      notes:
        "Condition-based replacement with no next deadline, demonstrating UNKNOWN.",
      nextDueKm: null,
      nextDueAt: null,
    },
    {
      id: "seed-maintenance-record-0005-spark-plug",
      scooterId: "seed-scooter-generated-0005",
      maintenanceTypeCode: "SPARK_PLUG",
      performedAt: utcDateAtOffset(seedDay, -120),
      performedKm: Math.max(0, scooterFiveMileage - 6_000),
      notes: "Spark-plug replacement now overdue by mileage.",
      nextDueKm: scooterFiveMileage,
      nextDueAt: utcDateAtOffset(seedDay, 245),
    },
    {
      id: "seed-maintenance-record-0006-transmission-oil",
      scooterId: "seed-scooter-generated-0006",
      maintenanceTypeCode: "TRANSMISSION_OIL_CHANGE",
      performedAt: utcDateAtOffset(seedDay, -120),
      performedKm: Math.max(0, scooterSixMileage - 5_700),
      notes: "Transmission oil is exactly at the due-soon mileage boundary.",
      nextDueKm: scooterSixMileage + 300,
      nextDueAt: utcDateAtOffset(seedDay, 245),
    },
  ];
}

function requiredMileage(
  mileageByScooterId: ReadonlyMap<string, number>,
  scooterId: string,
): number {
  const mileage = mileageByScooterId.get(scooterId);
  if (mileage === undefined) {
    throw new Error(`Missing maintenance demo mileage for ${scooterId}.`);
  }
  return mileage;
}

function utcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function utcDateAtOffset(
  seedDay: Date,
  dayOffset: number,
  hour = 0,
  minute = 0,
): Date {
  return new Date(
    Date.UTC(
      seedDay.getUTCFullYear(),
      seedDay.getUTCMonth(),
      seedDay.getUTCDate() + dayOffset,
      hour,
      minute,
    ),
  );
}
