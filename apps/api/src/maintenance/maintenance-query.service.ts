import { Injectable, NotFoundException } from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import type { Scooter, ScooterIssueSeverity } from "../generated/prisma/client";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  type MaintenanceRecordWithType,
  toMaintenanceRecord,
  toMaintenanceType,
  toScooterIssue,
} from "./maintenance.mapper";
import { calculateMaintenanceStatus } from "./maintenance-status";

interface LatestMaintenanceIdRow {
  id: string;
}

type ServiceScooterRow = Pick<
  Scooter,
  "id" | "vin" | "brand" | "model" | "currentMileageKm"
>;

type FleetIssueRow = Parameters<typeof toScooterIssue>[0] & {
  scooter: ServiceScooterRow;
};

type ServiceScheduleRecordRow = MaintenanceRecordWithType & {
  scooter: ServiceScooterRow;
};

export type ScooterMileage = Pick<Scooter, "id" | "currentMileageKm">;

const SEVERITY_PRIORITY: Record<ScooterIssueSeverity, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

const DASHBOARD_PRIORITY: Record<
  v1.maintenance.MaintenancePriorityReason,
  number
> = {
  CRITICAL_ISSUE: 0,
  HIGH_ISSUE: 1,
  OVERDUE_MAINTENANCE: 2,
  MEDIUM_ISSUE: 3,
  MAINTENANCE_DUE_SOON: 4,
  LOW_ISSUE: 5,
};

@Injectable()
export class MaintenanceQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async listFleetIssues(
    query: v1.maintenance.ListFleetIssuesQuery,
  ): Promise<v1.maintenance.FleetIssueList> {
    const searchFilter = query.search
      ? {
          OR: [
            { title: { contains: query.search, mode: "insensitive" as const } },
            {
              description: {
                contains: query.search,
                mode: "insensitive" as const,
              },
            },
            {
              scooter: {
                vin: { contains: query.search, mode: "insensitive" as const },
              },
            },
            {
              scooter: {
                brand: {
                  contains: query.search,
                  mode: "insensitive" as const,
                },
              },
            },
            {
              scooter: {
                model: {
                  contains: query.search,
                  mode: "insensitive" as const,
                },
              },
            },
            {
              scooter: {
                plateNumber: {
                  contains: query.search,
                  mode: "insensitive" as const,
                },
              },
            },
          ],
        }
      : {};
    const where: Prisma.ScooterIssueWhereInput = {
      scooter: { deletedAt: null },
      status: query.status,
      severity: query.severity,
      ...searchFilter,
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.scooterIssue.count({ where }),
      this.prisma.scooterIssue.findMany({
        where,
        include: {
          scooter: {
            select: {
              id: true,
              vin: true,
              brand: true,
              model: true,
              currentMileageKm: true,
            },
          },
        },
        orderBy: [{ severity: "desc" }, { reportedAt: "desc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      items: (items as FleetIssueRow[]).map((item) => ({
        issue: toScooterIssue(item),
        scooter: item.scooter,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async listServiceSchedule(
    query: v1.maintenance.ListServiceScheduleQuery,
    now = new Date(),
  ): Promise<v1.maintenance.ServiceScheduleList> {
    const records = await this.findLatestScheduleRecords(query.search);
    const items: v1.maintenance.ServiceScheduleItem[] = [];

    for (const record of records) {
      const status = calculateMaintenanceStatus({
        currentMileageKm: record.scooter.currentMileageKm,
        nextDueKm: record.nextDueKm,
        nextDueAt: record.nextDueAt,
        now,
      });
      if (
        (status !== "OVERDUE" && status !== "DUE_SOON") ||
        (query.status !== undefined && status !== query.status)
      ) {
        continue;
      }
      items.push({
        scooter: record.scooter,
        maintenanceType: toMaintenanceType(record.maintenanceType),
        latestRecord: toMaintenanceRecord(record),
        status,
      });
    }

    items.sort(compareScheduleItems);
    const total = items.length;
    const offset = (query.page - 1) * query.pageSize;

    return {
      items: items.slice(offset, offset + query.pageSize),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async overview(
    scooterId: string,
    now = new Date(),
  ): Promise<v1.maintenance.ScooterMaintenanceOverview> {
    const scooter = await this.prisma.scooter.findFirst({
      where: { id: scooterId, deletedAt: null },
      select: { id: true, currentMileageKm: true },
    });
    if (!scooter) {
      throw new NotFoundException("Scooter not found");
    }

    const [maintenanceTypes, issues, maintenanceHistory, latestRecords] =
      await Promise.all([
        this.prisma.maintenanceType.findMany({
          where: { isActive: true },
          orderBy: [{ name: "asc" }, { code: "asc" }],
        }),
        this.prisma.scooterIssue.findMany({
          where: { scooterId },
          orderBy: [{ reportedAt: "desc" }, { createdAt: "desc" }],
        }),
        this.prisma.maintenanceRecord.findMany({
          where: { scooterId },
          include: { maintenanceType: true },
          orderBy: [{ performedAt: "desc" }, { createdAt: "desc" }],
        }),
        this.findLatestActiveTypeRecords([scooterId]),
      ]);

    const openIssueRows = issues
      .filter((issue) => issue.status === "OPEN")
      .sort(
        (first, second) =>
          SEVERITY_PRIORITY[second.severity] -
            SEVERITY_PRIORITY[first.severity] ||
          second.reportedAt.getTime() - first.reportedAt.getTime(),
      );
    const issueCounts: v1.maintenance.ScooterIssueCounts = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      CRITICAL: 0,
    };
    for (const issue of openIssueRows) {
      issueCounts[issue.severity] += 1;
    }

    const latestByTypeId = new Map(
      latestRecords.map((record) => [record.maintenanceTypeId, record]),
    );
    const maintenanceStatuses: v1.maintenance.MaintenanceTypeStatus[] =
      maintenanceTypes.map((maintenanceType) => {
        const latestRecord = latestByTypeId.get(maintenanceType.id) ?? null;
        return {
          maintenanceType: toMaintenanceType(maintenanceType),
          latestRecord:
            latestRecord === null ? null : toMaintenanceRecord(latestRecord),
          status: calculateMaintenanceStatus({
            currentMileageKm: scooter.currentMileageKm,
            nextDueKm: latestRecord?.nextDueKm ?? null,
            nextDueAt: latestRecord?.nextDueAt ?? null,
            now,
          }),
        };
      });
    const overdueMaintenance = maintenanceStatuses.filter(
      (status) => status.status === "OVERDUE",
    );
    const dueSoonMaintenance = maintenanceStatuses.filter(
      (status) => status.status === "DUE_SOON",
    );
    const hasBlockingIssues = openIssueRows.some(
      (issue) => issue.severity === "HIGH" || issue.severity === "CRITICAL",
    );

    return {
      scooterId,
      currentMileageKm: scooter.currentMileageKm,
      openIssues: openIssueRows.map(toScooterIssue),
      issueCounts,
      hasBlockingIssues,
      maintenanceAttentionRequired:
        openIssueRows.length > 0 ||
        overdueMaintenance.length > 0 ||
        dueSoonMaintenance.length > 0,
      recommendedOperationalStatus: hasBlockingIssues
        ? "UNAVAILABLE"
        : "AVAILABLE",
      maintenanceStatuses,
      overdueMaintenance,
      dueSoonMaintenance,
      activity: this.buildActivity(issues, maintenanceHistory),
    };
  }

  async dashboard(
    now = new Date(),
  ): Promise<v1.maintenance.FleetMaintenanceDashboard> {
    const scooters = await this.prisma.scooter.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        vin: true,
        brand: true,
        model: true,
        currentMileageKm: true,
      },
      orderBy: [{ vin: "asc" }, { id: "asc" }],
    });
    const summaries = await this.getAttentionSummaries(scooters, now);
    let scootersWithOpenIssues = 0;
    let scootersWithBlockingIssues = 0;
    let scootersWithOverdueMaintenance = 0;
    let scootersWithMaintenanceDueSoon = 0;
    const requiresAttention: v1.maintenance.FleetMaintenanceDashboardItem[] =
      [];

    for (const scooter of scooters) {
      const attentionSummary = summaries.get(scooter.id)!;
      if (attentionSummary.highestOpenIssueSeverity !== null) {
        scootersWithOpenIssues += 1;
      }
      if (attentionSummary.hasBlockingIssues) {
        scootersWithBlockingIssues += 1;
      }
      if (attentionSummary.hasOverdueMaintenance) {
        scootersWithOverdueMaintenance += 1;
      }
      if (attentionSummary.hasMaintenanceDueSoon) {
        scootersWithMaintenanceDueSoon += 1;
      }
      if (!attentionSummary.maintenanceAttentionRequired) {
        continue;
      }

      requiresAttention.push({
        id: scooter.id,
        vin: scooter.vin,
        brand: scooter.brand,
        model: scooter.model,
        currentMileageKm: scooter.currentMileageKm,
        attentionSummary,
        priorityReason: this.priorityReason(attentionSummary),
      });
    }

    requiresAttention.sort(
      (first, second) =>
        DASHBOARD_PRIORITY[first.priorityReason] -
          DASHBOARD_PRIORITY[second.priorityReason] ||
        first.vin.localeCompare(second.vin) ||
        first.id.localeCompare(second.id),
    );

    return {
      totalScooters: scooters.length,
      scootersWithOpenIssues,
      scootersWithBlockingIssues,
      scootersWithOverdueMaintenance,
      scootersWithMaintenanceDueSoon,
      requiresAttention,
    };
  }

  async getAttentionSummaries(
    scooters: readonly ScooterMileage[],
    now = new Date(),
  ): Promise<Map<string, v1.maintenance.ScooterMaintenanceAttentionSummary>> {
    if (scooters.length === 0) {
      return new Map();
    }

    const scooterIds = scooters.map((scooter) => scooter.id);
    const [issueGroups, latestRecords] = await Promise.all([
      this.prisma.scooterIssue.groupBy({
        by: ["scooterId", "severity"],
        where: { scooterId: { in: scooterIds }, status: "OPEN" },
        _count: { _all: true },
      }),
      this.findLatestActiveTypeRecords(scooterIds),
    ]);
    const highestSeverityByScooter = new Map<string, ScooterIssueSeverity>();
    for (const group of issueGroups) {
      const current = highestSeverityByScooter.get(group.scooterId);
      if (
        current === undefined ||
        SEVERITY_PRIORITY[group.severity] > SEVERITY_PRIORITY[current]
      ) {
        highestSeverityByScooter.set(group.scooterId, group.severity);
      }
    }

    const mileageByScooter = new Map(
      scooters.map((scooter) => [scooter.id, scooter.currentMileageKm]),
    );
    const dueFlagsByScooter = new Map<
      string,
      { overdue: boolean; dueSoon: boolean }
    >();
    for (const record of latestRecords) {
      const status = calculateMaintenanceStatus({
        currentMileageKm: mileageByScooter.get(record.scooterId) ?? null,
        nextDueKm: record.nextDueKm,
        nextDueAt: record.nextDueAt,
        now,
      });
      const flags = dueFlagsByScooter.get(record.scooterId) ?? {
        overdue: false,
        dueSoon: false,
      };
      flags.overdue ||= status === "OVERDUE";
      flags.dueSoon ||= status === "DUE_SOON";
      dueFlagsByScooter.set(record.scooterId, flags);
    }

    return new Map(
      scooters.map((scooter) => {
        const highestOpenIssueSeverity =
          highestSeverityByScooter.get(scooter.id) ?? null;
        const flags = dueFlagsByScooter.get(scooter.id) ?? {
          overdue: false,
          dueSoon: false,
        };
        const hasBlockingIssues =
          highestOpenIssueSeverity === "HIGH" ||
          highestOpenIssueSeverity === "CRITICAL";
        const summary: v1.maintenance.ScooterMaintenanceAttentionSummary = {
          highestOpenIssueSeverity,
          hasBlockingIssues,
          hasOverdueMaintenance: flags.overdue,
          hasMaintenanceDueSoon: flags.dueSoon,
          maintenanceAttentionRequired:
            highestOpenIssueSeverity !== null || flags.overdue || flags.dueSoon,
          recommendedOperationalStatus: hasBlockingIssues
            ? "UNAVAILABLE"
            : "AVAILABLE",
        };
        return [scooter.id, summary];
      }),
    );
  }

  private async findLatestActiveTypeRecords(
    scooterIds: readonly string[],
  ): Promise<MaintenanceRecordWithType[]> {
    if (scooterIds.length === 0) {
      return [];
    }

    // DISTINCT ON matches the supporting composite index and returns one row
    // per scooter/type without loading full histories into application memory.
    const idRows = await this.prisma.$queryRaw<LatestMaintenanceIdRow[]>(
      Prisma.sql`
        SELECT DISTINCT ON (record."scooterId", record."maintenanceTypeId")
          record.id
        FROM "MaintenanceRecord" AS record
        INNER JOIN "MaintenanceType" AS type
          ON type.id = record."maintenanceTypeId"
          AND type."isActive" = true
        WHERE record."scooterId" IN (${Prisma.join(scooterIds)})
        ORDER BY
          record."scooterId" ASC,
          record."maintenanceTypeId" ASC,
          record."performedAt" DESC,
          record."createdAt" DESC
      `,
    );
    const ids = idRows.map((row) => row.id);
    if (ids.length === 0) {
      return [];
    }

    return this.prisma.maintenanceRecord.findMany({
      where: { id: { in: ids } },
      include: { maintenanceType: true },
    });
  }

  private async findLatestScheduleRecords(
    search: string | undefined,
  ): Promise<ServiceScheduleRecordRow[]> {
    const searchCondition = search
      ? Prisma.sql`
          AND (
            scooter.vin ILIKE ${`%${search}%`}
            OR scooter.brand ILIKE ${`%${search}%`}
            OR scooter.model ILIKE ${`%${search}%`}
            OR COALESCE(scooter."plateNumber", '') ILIKE ${`%${search}%`}
            OR type.name ILIKE ${`%${search}%`}
            OR type.code ILIKE ${`%${search}%`}
          )
        `
      : Prisma.empty;
    const idRows = await this.prisma.$queryRaw<LatestMaintenanceIdRow[]>(
      Prisma.sql`
        SELECT DISTINCT ON (record."scooterId", record."maintenanceTypeId")
          record.id
        FROM "MaintenanceRecord" AS record
        INNER JOIN "MaintenanceType" AS type
          ON type.id = record."maintenanceTypeId"
          AND type."isActive" = true
        INNER JOIN "Scooter" AS scooter
          ON scooter.id = record."scooterId"
          AND scooter."deletedAt" IS NULL
        WHERE TRUE
        ${searchCondition}
        ORDER BY
          record."scooterId" ASC,
          record."maintenanceTypeId" ASC,
          record."performedAt" DESC,
          record."createdAt" DESC,
          record.id ASC
      `,
    );
    const ids = idRows.map((row) => row.id);
    if (ids.length === 0) {
      return [];
    }

    return this.prisma.maintenanceRecord.findMany({
      where: { id: { in: ids } },
      include: {
        maintenanceType: true,
        scooter: {
          select: {
            id: true,
            vin: true,
            brand: true,
            model: true,
            currentMileageKm: true,
          },
        },
      },
    });
  }

  private buildActivity(
    issues: readonly {
      id: string;
      title: string;
      severity: v1.maintenance.ScooterIssueSeverity;
      status: "OPEN" | "FIXED";
      reportedAt: Date;
      resolvedAt: Date | null;
    }[],
    maintenanceHistory: readonly MaintenanceRecordWithType[],
  ): v1.maintenance.MaintenanceActivity[] {
    const activity: v1.maintenance.MaintenanceActivity[] = [];
    for (const issue of issues) {
      activity.push({
        kind: "ISSUE_REPORTED",
        occurredAt: issue.reportedAt.toISOString(),
        title: issue.title,
        severity: issue.severity,
        issueId: issue.id,
        maintenanceRecordId: null,
        performedKm: null,
      });
      if (issue.status === "FIXED" && issue.resolvedAt !== null) {
        activity.push({
          kind: "ISSUE_FIXED",
          occurredAt: issue.resolvedAt.toISOString(),
          title: issue.title,
          severity: issue.severity,
          issueId: issue.id,
          maintenanceRecordId: null,
          performedKm: null,
        });
      }
    }
    for (const record of maintenanceHistory) {
      activity.push({
        kind: "MAINTENANCE_COMPLETED",
        occurredAt: record.performedAt.toISOString(),
        title: record.maintenanceType.name,
        issueId: null,
        maintenanceRecordId: record.id,
        performedKm: record.performedKm,
      });
    }

    // Reopening clears resolvedAt in the MVP data model, so a historical
    // ISSUE_REOPENED event cannot be reconstructed accurately and is omitted.
    return activity.sort(
      (first, second) =>
        second.occurredAt.localeCompare(first.occurredAt) ||
        first.kind.localeCompare(second.kind),
    );
  }

  private priorityReason(
    summary: v1.maintenance.ScooterMaintenanceAttentionSummary,
  ): v1.maintenance.MaintenancePriorityReason {
    if (summary.highestOpenIssueSeverity === "CRITICAL") {
      return "CRITICAL_ISSUE";
    }
    if (summary.highestOpenIssueSeverity === "HIGH") {
      return "HIGH_ISSUE";
    }
    if (summary.hasOverdueMaintenance) {
      return "OVERDUE_MAINTENANCE";
    }
    if (summary.highestOpenIssueSeverity === "MEDIUM") {
      return "MEDIUM_ISSUE";
    }
    if (summary.hasMaintenanceDueSoon) {
      return "MAINTENANCE_DUE_SOON";
    }
    return "LOW_ISSUE";
  }
}

function compareScheduleItems(
  first: v1.maintenance.ServiceScheduleItem,
  second: v1.maintenance.ServiceScheduleItem,
): number {
  const statusDifference =
    (first.status === "OVERDUE" ? 0 : 1) -
    (second.status === "OVERDUE" ? 0 : 1);
  if (statusDifference !== 0) return statusDifference;

  const dateDifference = compareNullable(
    first.latestRecord.nextDueAt,
    second.latestRecord.nextDueAt,
  );
  if (dateDifference !== 0) return dateDifference;

  const mileageDifference = compareNullable(
    first.latestRecord.nextDueKm,
    second.latestRecord.nextDueKm,
  );
  if (mileageDifference !== 0) return mileageDifference;

  return (
    first.scooter.vin.localeCompare(second.scooter.vin) ||
    first.maintenanceType.name.localeCompare(second.maintenanceType.name) ||
    first.latestRecord.id.localeCompare(second.latestRecord.id)
  );
}

function compareNullable<T extends string | number>(
  first: T | null,
  second: T | null,
): number {
  if (first === null && second === null) return 0;
  if (first === null) return 1;
  if (second === null) return -1;
  return first < second ? -1 : first > second ? 1 : 0;
}
