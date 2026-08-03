/**
 * Scooter-maintenance request and response contracts.
 */
import { z } from "zod";

import {
  dateOnlySchema,
  nullableTrimmedStringSchema,
  optionalSearchStringSchema,
  requiredTrimmedStringSchema,
} from "../common/common.schemas";
import {
  MAINTENANCE_ACTIVITY_KINDS,
  MAINTENANCE_PRIORITY_REASONS,
  MAINTENANCE_STATUSES,
  RECOMMENDED_OPERATIONAL_STATUSES,
  SCOOTER_ISSUE_SEVERITIES,
  SCOOTER_ISSUE_STATUSES,
} from "./maintenance.constants";

const MAX_DB_INT = 2_147_483_647;
const MAX_PAGE_SIZE = 100;
const MAX_TITLE_LENGTH = 160;
const MAX_DESCRIPTION_LENGTH = 4_000;
const MAX_NOTES_LENGTH = 4_000;
const MAX_SEARCH_LENGTH = 200;

const idSchema = z.string().trim().min(1);
const isoTimestampSchema = z.iso.datetime({ offset: true });
const pageSchema = z.coerce.number().int().min(1).default(1);
const pageSizeSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_PAGE_SIZE)
  .default(25);

export const mileageKmSchema = z.number().int().min(0).max(MAX_DB_INT);
export const scooterIssueSeveritySchema = z.enum(SCOOTER_ISSUE_SEVERITIES);
export const scooterIssueStatusSchema = z.enum(SCOOTER_ISSUE_STATUSES);
export const maintenanceStatusSchema = z.enum(MAINTENANCE_STATUSES);
export const maintenanceActivityKindSchema = z.enum(MAINTENANCE_ACTIVITY_KINDS);
export const recommendedOperationalStatusSchema = z.enum(
  RECOMMENDED_OPERATIONAL_STATUSES,
);
export const maintenancePriorityReasonSchema = z.enum(
  MAINTENANCE_PRIORITY_REASONS,
);

export const scooterIssueSchema = z
  .object({
    id: z.string(),
    scooterId: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    severity: scooterIssueSeveritySchema,
    status: scooterIssueStatusSchema,
    reportedAt: isoTimestampSchema,
    resolvedAt: isoTimestampSchema.nullable(),
    reportedByUserId: z.string().nullable(),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .meta({ id: "ScooterIssue" });

export type ScooterIssue = z.infer<typeof scooterIssueSchema>;

export const createScooterIssueInputSchema = z
  .object({
    title: requiredTrimmedStringSchema(MAX_TITLE_LENGTH),
    description: nullableTrimmedStringSchema(MAX_DESCRIPTION_LENGTH).optional(),
    severity: scooterIssueSeveritySchema,
  })
  .strict()
  .meta({ id: "CreateScooterIssueInput" });

export type CreateScooterIssueInput = z.infer<
  typeof createScooterIssueInputSchema
>;

export const updateScooterIssueInputSchema = z
  .object({
    title: requiredTrimmedStringSchema(MAX_TITLE_LENGTH).optional(),
    description: nullableTrimmedStringSchema(MAX_DESCRIPTION_LENGTH).optional(),
    severity: scooterIssueSeveritySchema.optional(),
  })
  .strict()
  .meta({ id: "UpdateScooterIssueInput" });

export type UpdateScooterIssueInput = z.infer<
  typeof updateScooterIssueInputSchema
>;

export const fixScooterIssueInputSchema = z
  .object({})
  .strict()
  .meta({ id: "FixScooterIssueInput" });

export type FixScooterIssueInput = z.infer<typeof fixScooterIssueInputSchema>;

export const reopenScooterIssueInputSchema = z
  .object({})
  .strict()
  .meta({ id: "ReopenScooterIssueInput" });

export type ReopenScooterIssueInput = z.infer<
  typeof reopenScooterIssueInputSchema
>;

export const listScooterIssuesQuerySchema = z
  .object({
    page: pageSchema,
    pageSize: pageSizeSchema,
    status: scooterIssueStatusSchema.optional(),
    severity: scooterIssueSeveritySchema.optional(),
  })
  .strict()
  .meta({ id: "ListScooterIssuesQuery" });

export type ListScooterIssuesQuery = z.infer<
  typeof listScooterIssuesQuerySchema
>;

export const scooterIssueListSchema = z
  .object({
    items: z.array(scooterIssueSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE),
    total: z.number().int().min(0),
  })
  .meta({ id: "ScooterIssueList" });

export type ScooterIssueList = z.infer<typeof scooterIssueListSchema>;

export const serviceScooterDescriptorSchema = z
  .object({
    id: z.string(),
    vin: z.string(),
    brand: z.string(),
    model: z.string(),
    currentMileageKm: mileageKmSchema.nullable(),
  })
  .meta({ id: "ServiceScooterDescriptor" });

export type ServiceScooterDescriptor = z.infer<
  typeof serviceScooterDescriptorSchema
>;

export const listFleetIssuesQuerySchema = z
  .object({
    page: pageSchema,
    pageSize: pageSizeSchema,
    search: optionalSearchStringSchema(MAX_SEARCH_LENGTH),
    status: scooterIssueStatusSchema.optional(),
    severity: scooterIssueSeveritySchema.optional(),
  })
  .strict()
  .meta({ id: "ListFleetIssuesQuery" });

export type ListFleetIssuesQuery = z.infer<typeof listFleetIssuesQuerySchema>;

export const fleetIssueItemSchema = z
  .object({
    issue: scooterIssueSchema,
    scooter: serviceScooterDescriptorSchema,
  })
  .meta({ id: "FleetIssueItem" });

export type FleetIssueItem = z.infer<typeof fleetIssueItemSchema>;

export const fleetIssueListSchema = z
  .object({
    items: z.array(fleetIssueItemSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE),
    total: z.number().int().min(0),
  })
  .meta({ id: "FleetIssueList" });

export type FleetIssueList = z.infer<typeof fleetIssueListSchema>;

export const maintenanceTypeSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    code: z.string(),
    intervalKm: z.number().int().positive().max(MAX_DB_INT).nullable(),
    intervalMonths: z.number().int().positive().max(MAX_DB_INT).nullable(),
    isActive: z.boolean(),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .meta({ id: "MaintenanceType" });

export type MaintenanceType = z.infer<typeof maintenanceTypeSchema>;

export const maintenanceTypeListSchema = z
  .array(maintenanceTypeSchema)
  .meta({ id: "MaintenanceTypeList" });

export type MaintenanceTypeList = z.infer<typeof maintenanceTypeListSchema>;

export const maintenanceRecordSchema = z
  .object({
    id: z.string(),
    scooterId: z.string(),
    maintenanceTypeId: z.string(),
    maintenanceType: maintenanceTypeSchema,
    performedAt: dateOnlySchema,
    performedKm: mileageKmSchema,
    notes: z.string().nullable(),
    nextDueKm: mileageKmSchema.nullable(),
    nextDueAt: dateOnlySchema.nullable(),
    recordedByUserId: z.string().nullable(),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .meta({ id: "MaintenanceRecord" });

export type MaintenanceRecord = z.infer<typeof maintenanceRecordSchema>;

export const createMaintenanceRecordInputSchema = z
  .object({
    maintenanceTypeId: idSchema,
    performedAt: dateOnlySchema,
    performedKm: mileageKmSchema,
    notes: nullableTrimmedStringSchema(MAX_NOTES_LENGTH).optional(),
    // Omit a deadline to let the API calculate it from the maintenance type.
    nextDueKm: mileageKmSchema.optional(),
    nextDueAt: dateOnlySchema.optional(),
  })
  .strict()
  .superRefine(validateCreateMaintenanceDeadlines)
  .meta({ id: "CreateMaintenanceRecordInput" });

export type CreateMaintenanceRecordInput = z.infer<
  typeof createMaintenanceRecordInputSchema
>;

export const updateMaintenanceRecordInputSchema = z
  .object({
    maintenanceTypeId: idSchema.optional(),
    performedAt: dateOnlySchema.optional(),
    performedKm: mileageKmSchema.optional(),
    notes: nullableTrimmedStringSchema(MAX_NOTES_LENGTH).optional(),
    // Explicit null clears a deadline; omission leaves its current value intact.
    nextDueKm: mileageKmSchema.nullable().optional(),
    nextDueAt: dateOnlySchema.nullable().optional(),
  })
  .strict()
  .superRefine(validateUpdateMaintenanceDeadlines)
  .meta({ id: "UpdateMaintenanceRecordInput" });

export type UpdateMaintenanceRecordInput = z.infer<
  typeof updateMaintenanceRecordInputSchema
>;

export const listMaintenanceRecordsQuerySchema = z
  .object({
    page: pageSchema,
    pageSize: pageSizeSchema,
    maintenanceTypeId: idSchema.optional(),
  })
  .strict()
  .meta({ id: "ListMaintenanceRecordsQuery" });

export type ListMaintenanceRecordsQuery = z.infer<
  typeof listMaintenanceRecordsQuerySchema
>;

export const maintenanceRecordListSchema = z
  .object({
    items: z.array(maintenanceRecordSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE),
    total: z.number().int().min(0),
  })
  .meta({ id: "MaintenanceRecordList" });

export type MaintenanceRecordList = z.infer<typeof maintenanceRecordListSchema>;

export const serviceScheduleStatusSchema = z.enum(["DUE_SOON", "OVERDUE"]);

export type ServiceScheduleStatus = z.infer<typeof serviceScheduleStatusSchema>;

export const listServiceScheduleQuerySchema = z
  .object({
    page: pageSchema,
    pageSize: pageSizeSchema,
    search: optionalSearchStringSchema(MAX_SEARCH_LENGTH),
    status: serviceScheduleStatusSchema.optional(),
  })
  .strict()
  .meta({ id: "ListServiceScheduleQuery" });

export type ListServiceScheduleQuery = z.infer<
  typeof listServiceScheduleQuerySchema
>;

export const serviceScheduleItemSchema = z
  .object({
    scooter: serviceScooterDescriptorSchema,
    maintenanceType: maintenanceTypeSchema,
    latestRecord: maintenanceRecordSchema,
    status: serviceScheduleStatusSchema,
  })
  .meta({ id: "ServiceScheduleItem" });

export type ServiceScheduleItem = z.infer<typeof serviceScheduleItemSchema>;

export const serviceScheduleListSchema = z
  .object({
    items: z.array(serviceScheduleItemSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE),
    total: z.number().int().min(0),
  })
  .meta({ id: "ServiceScheduleList" });

export type ServiceScheduleList = z.infer<typeof serviceScheduleListSchema>;

export const scooterMaintenanceAttentionSummarySchema = z
  .object({
    highestOpenIssueSeverity: scooterIssueSeveritySchema.nullable(),
    hasBlockingIssues: z.boolean(),
    hasOverdueMaintenance: z.boolean(),
    hasMaintenanceDueSoon: z.boolean(),
    maintenanceAttentionRequired: z.boolean(),
    recommendedOperationalStatus: recommendedOperationalStatusSchema,
  })
  .meta({ id: "ScooterMaintenanceAttentionSummary" });

export type ScooterMaintenanceAttentionSummary = z.infer<
  typeof scooterMaintenanceAttentionSummarySchema
>;

export const maintenanceTypeStatusSchema = z
  .object({
    maintenanceType: maintenanceTypeSchema,
    latestRecord: maintenanceRecordSchema.nullable(),
    status: maintenanceStatusSchema,
  })
  .meta({ id: "MaintenanceTypeStatus" });

export type MaintenanceTypeStatus = z.infer<typeof maintenanceTypeStatusSchema>;

const maintenanceIssueActivityBase = {
  occurredAt: isoTimestampSchema,
  title: z.string(),
  severity: scooterIssueSeveritySchema,
  issueId: z.string(),
  maintenanceRecordId: z.null(),
  performedKm: z.null(),
};

export const issueReportedMaintenanceActivitySchema = z
  .object({
    kind: z.literal("ISSUE_REPORTED"),
    ...maintenanceIssueActivityBase,
  })
  .meta({ id: "IssueReportedMaintenanceActivity" });

export type IssueReportedMaintenanceActivity = z.infer<
  typeof issueReportedMaintenanceActivitySchema
>;

export const issueFixedMaintenanceActivitySchema = z
  .object({
    kind: z.literal("ISSUE_FIXED"),
    ...maintenanceIssueActivityBase,
  })
  .meta({ id: "IssueFixedMaintenanceActivity" });

export type IssueFixedMaintenanceActivity = z.infer<
  typeof issueFixedMaintenanceActivitySchema
>;

export const issueReopenedMaintenanceActivitySchema = z
  .object({
    kind: z.literal("ISSUE_REOPENED"),
    ...maintenanceIssueActivityBase,
  })
  .meta({ id: "IssueReopenedMaintenanceActivity" });

export type IssueReopenedMaintenanceActivity = z.infer<
  typeof issueReopenedMaintenanceActivitySchema
>;

export const maintenanceCompletedActivitySchema = z
  .object({
    kind: z.literal("MAINTENANCE_COMPLETED"),
    occurredAt: isoTimestampSchema,
    title: z.string(),
    issueId: z.null(),
    maintenanceRecordId: z.string(),
    performedKm: mileageKmSchema.nullable(),
  })
  .meta({ id: "MaintenanceCompletedActivity" });

export type MaintenanceCompletedActivity = z.infer<
  typeof maintenanceCompletedActivitySchema
>;

export const maintenanceActivitySchema = z
  .discriminatedUnion("kind", [
    issueReportedMaintenanceActivitySchema,
    issueFixedMaintenanceActivitySchema,
    issueReopenedMaintenanceActivitySchema,
    maintenanceCompletedActivitySchema,
  ])
  .meta({ id: "MaintenanceActivity" });

export type MaintenanceActivity = z.infer<typeof maintenanceActivitySchema>;

export const maintenanceActivityListSchema = z
  .array(maintenanceActivitySchema)
  .meta({ id: "MaintenanceActivityList" });

export type MaintenanceActivityList = z.infer<
  typeof maintenanceActivityListSchema
>;

export const scooterIssueCountsSchema = z
  .object({
    LOW: z.number().int().min(0),
    MEDIUM: z.number().int().min(0),
    HIGH: z.number().int().min(0),
    CRITICAL: z.number().int().min(0),
  })
  .meta({ id: "ScooterIssueCounts" });

export type ScooterIssueCounts = z.infer<typeof scooterIssueCountsSchema>;

export const scooterMaintenanceOverviewSchema = z
  .object({
    scooterId: z.string(),
    currentMileageKm: mileageKmSchema.nullable(),
    openIssues: z.array(scooterIssueSchema),
    issueCounts: scooterIssueCountsSchema,
    hasBlockingIssues: z.boolean(),
    maintenanceAttentionRequired: z.boolean(),
    recommendedOperationalStatus: recommendedOperationalStatusSchema,
    maintenanceStatuses: z.array(maintenanceTypeStatusSchema),
    overdueMaintenance: z.array(maintenanceTypeStatusSchema),
    dueSoonMaintenance: z.array(maintenanceTypeStatusSchema),
    activity: maintenanceActivityListSchema,
  })
  .meta({ id: "ScooterMaintenanceOverview" });

export type ScooterMaintenanceOverview = z.infer<
  typeof scooterMaintenanceOverviewSchema
>;

export const fleetMaintenanceDashboardItemSchema = z
  .object({
    id: z.string(),
    vin: z.string(),
    brand: z.string(),
    model: z.string(),
    currentMileageKm: mileageKmSchema.nullable(),
    attentionSummary: scooterMaintenanceAttentionSummarySchema,
    priorityReason: maintenancePriorityReasonSchema,
  })
  .meta({ id: "FleetMaintenanceDashboardItem" });

export type FleetMaintenanceDashboardItem = z.infer<
  typeof fleetMaintenanceDashboardItemSchema
>;

export const fleetMaintenanceDashboardSchema = z
  .object({
    totalScooters: z.number().int().min(0),
    scootersWithOpenIssues: z.number().int().min(0),
    scootersWithBlockingIssues: z.number().int().min(0),
    scootersWithOverdueMaintenance: z.number().int().min(0),
    scootersWithMaintenanceDueSoon: z.number().int().min(0),
    requiresAttention: z.array(fleetMaintenanceDashboardItemSchema),
  })
  .meta({ id: "FleetMaintenanceDashboard" });

export type FleetMaintenanceDashboard = z.infer<
  typeof fleetMaintenanceDashboardSchema
>;

function validateCreateMaintenanceDeadlines(
  input: {
    performedAt: string;
    performedKm: number;
    nextDueKm?: number;
    nextDueAt?: string;
  },
  ctx: z.RefinementCtx,
): void {
  if (input.nextDueKm !== undefined && input.nextDueKm <= input.performedKm) {
    addNextDueKmIssue(ctx);
  }

  if (input.nextDueAt !== undefined && input.nextDueAt <= input.performedAt) {
    addNextDueAtIssue(ctx);
  }
}

function validateUpdateMaintenanceDeadlines(
  input: {
    performedAt?: string;
    performedKm?: number;
    nextDueKm?: number | null;
    nextDueAt?: string | null;
  },
  ctx: z.RefinementCtx,
): void {
  if (
    input.performedKm !== undefined &&
    input.nextDueKm !== undefined &&
    input.nextDueKm !== null &&
    input.nextDueKm <= input.performedKm
  ) {
    addNextDueKmIssue(ctx);
  }

  if (
    input.performedAt !== undefined &&
    input.nextDueAt !== undefined &&
    input.nextDueAt !== null &&
    input.nextDueAt <= input.performedAt
  ) {
    addNextDueAtIssue(ctx);
  }
}

function addNextDueKmIssue(ctx: z.RefinementCtx): void {
  ctx.addIssue({
    code: "custom",
    message: "Next due mileage must be greater than performed mileage.",
    path: ["nextDueKm"],
  });
}

function addNextDueAtIssue(ctx: z.RefinementCtx): void {
  ctx.addIssue({
    code: "custom",
    message: "Next due date must be after the performed date.",
    path: ["nextDueAt"],
  });
}
