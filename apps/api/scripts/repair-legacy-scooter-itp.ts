import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { v1 } from "@repo/api-shared";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import {
  toDateOnlyDate,
  toDateOnlyString,
} from "../src/common/dates/date-only";
import { legacyItpRepairPlan } from "../src/scooters/legacy-itp-repair";

const include = {
  brand: true,
  civDocument: true,
  documents: {
    where: { deletedAt: null, asset: { deletedAt: null } },
    select: { type: true, extractedData: true },
  },
  inspections: {
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
  },
} satisfies Prisma.ScooterInclude;

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--apply" && arg !== "--dry-run"))
    throw new Error("Use --dry-run (default) or --apply.");
  if (args.includes("--apply") && args.includes("--dry-run"))
    throw new Error("Choose either --dry-run or --apply.");
  const apply = args.includes("--apply");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required.");
  const db = new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    }),
  });
  try {
    const scooters = await db.scooter.findMany({
      where: { deletedAt: null },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    for (const { id } of scooters) {
      // Re-read and plan under the same lock as editor saves. Each scooter is atomic.
      const report = await db.$transaction(async (tx) => {
        if (apply)
          await tx.$queryRaw`
            SELECT id FROM "Scooter" WHERE id = ${id} AND "deletedAt" IS NULL FOR UPDATE
          `;
        const row = await tx.scooter.findFirst({
          where: { id, deletedAt: null },
          include,
        });
        if (!row) return null;
        const plan = legacyItpRepairPlan({
          civIssuedAt: toDateOnlyString(row.civDocument?.issuedAt ?? null),
          documents: row.documents,
          inspections: row.inspections.map((inspection) => ({
            ...inspection,
            inspectionDate: toDateOnlyString(inspection.inspectionDate),
            validUntil: toDateOnlyString(inspection.validUntil),
          })),
        });
        if (apply && plan.civIssuedAt)
          await tx.vehicleCivDocument.upsert({
            where: { scooterId: id },
            create: {
              scooterId: id,
              issuedAt: toDateOnlyDate(plan.civIssuedAt),
            },
            update: { issuedAt: toDateOnlyDate(plan.civIssuedAt) },
          });
        if (apply && plan.confirmInspectionId)
          await tx.scooterItpInspection.update({
            where: { id: plan.confirmInspectionId },
            data: { result: "passed" },
          });
        if (apply && (plan.civIssuedAt || plan.confirmInspectionId))
          await tx.scooter.update({
            where: { id },
            data: {
              updatedAt: new Date(
                Math.max(Date.now(), row.updatedAt.getTime() + 1),
              ),
            },
          });
        return {
          scooter: v1.scooters.scooterDisplayCode({
            fleetNumber: row.fleetNumber,
            brandCode: row.brand.code,
          }),
          id,
          mode: apply ? "apply" : "dry-run",
          ...plan,
        };
      });
      if (report) console.log(JSON.stringify(report));
    }
  } finally {
    await db.$disconnect();
  }
}

void main().catch(() => {
  // Database error messages can contain connection details.
  console.error(
    "Legacy ITP repair failed. Completed scooters can safely be rerun.",
  );
  process.exitCode = 1;
});
