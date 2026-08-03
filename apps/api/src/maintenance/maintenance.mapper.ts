import { v1 } from "@repo/api-shared";

import { toDateOnlyString } from "../common/dates/date-only";
import type {
  MaintenanceRecord as MaintenanceRecordRow,
  MaintenanceType as MaintenanceTypeRow,
  ScooterIssue as ScooterIssueRow,
} from "../generated/prisma/client";

export type MaintenanceRecordWithType = MaintenanceRecordRow & {
  maintenanceType: MaintenanceTypeRow;
};

export function toScooterIssue(
  row: ScooterIssueRow,
): v1.maintenance.ScooterIssue {
  return {
    id: row.id,
    scooterId: row.scooterId,
    title: row.title,
    description: row.description,
    severity: row.severity,
    status: row.status,
    reportedAt: row.reportedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    reportedByUserId: row.reportedByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toMaintenanceType(
  row: MaintenanceTypeRow,
): v1.maintenance.MaintenanceType {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    intervalKm: row.intervalKm,
    intervalMonths: row.intervalMonths,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toMaintenanceRecord(
  row: MaintenanceRecordWithType,
): v1.maintenance.MaintenanceRecord {
  return {
    id: row.id,
    scooterId: row.scooterId,
    maintenanceTypeId: row.maintenanceTypeId,
    maintenanceType: toMaintenanceType(row.maintenanceType),
    performedAt: toDateOnlyString(row.performedAt)!,
    performedKm: row.performedKm,
    notes: row.notes,
    nextDueKm: row.nextDueKm,
    nextDueAt: toDateOnlyString(row.nextDueAt),
    recordedByUserId: row.recordedByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
