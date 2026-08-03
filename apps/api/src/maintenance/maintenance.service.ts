import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import { toDateOnlyDate } from "../common/dates/date-only";
import type {
  MaintenanceType,
  Prisma,
  ScooterIssue,
} from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { MaintenanceRecordWithType } from "./maintenance.mapper";
import { calculateNextDeadlines } from "./maintenance-status";

const MAX_DATABASE_INT = 2_147_483_647;

@Injectable()
export class MaintenanceService {
  constructor(private readonly prisma: PrismaService) {}

  listTypes(): Promise<MaintenanceType[]> {
    return this.prisma.maintenanceType.findMany({
      where: { isActive: true },
      orderBy: [{ name: "asc" }, { code: "asc" }],
    });
  }

  async listIssues(
    scooterId: string,
    query: v1.maintenance.ListScooterIssuesQuery,
  ): Promise<{
    items: ScooterIssue[];
    page: number;
    pageSize: number;
    total: number;
  }> {
    await this.assertActiveScooter(scooterId);
    const where: Prisma.ScooterIssueWhereInput = {
      scooterId,
      status: query.status,
      severity: query.severity,
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.scooterIssue.count({ where }),
      this.prisma.scooterIssue.findMany({
        where,
        orderBy: [
          { status: "asc" },
          { severity: "desc" },
          { reportedAt: "desc" },
        ],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async createIssue(
    scooterId: string,
    input: v1.maintenance.CreateScooterIssueInput,
    reportedByUserId: string,
  ): Promise<ScooterIssue> {
    await this.assertActiveScooter(scooterId);
    return this.prisma.scooterIssue.create({
      data: {
        scooterId,
        title: input.title,
        description: input.description ?? null,
        severity: input.severity,
        reportedByUserId,
      },
    });
  }

  async updateIssue(
    scooterId: string,
    issueId: string,
    input: v1.maintenance.UpdateScooterIssueInput,
  ): Promise<ScooterIssue> {
    await this.assertActiveScooter(scooterId);
    await this.assertIssue(scooterId, issueId);

    return this.prisma.scooterIssue.update({
      where: { id: issueId },
      data: {
        title: input.title,
        description: input.description,
        severity: input.severity,
      },
    });
  }

  async fixIssue(scooterId: string, issueId: string): Promise<ScooterIssue> {
    await this.assertActiveScooter(scooterId);
    const issue = await this.assertIssue(scooterId, issueId);
    if (issue.status === "FIXED") {
      return issue;
    }

    return this.prisma.scooterIssue.update({
      where: { id: issueId },
      data: { status: "FIXED", resolvedAt: new Date() },
    });
  }

  async reopenIssue(scooterId: string, issueId: string): Promise<ScooterIssue> {
    await this.assertActiveScooter(scooterId);
    const issue = await this.assertIssue(scooterId, issueId);
    if (issue.status === "OPEN") {
      return issue;
    }

    return this.prisma.scooterIssue.update({
      where: { id: issueId },
      data: { status: "OPEN", resolvedAt: null },
    });
  }

  async listRecords(
    scooterId: string,
    query: v1.maintenance.ListMaintenanceRecordsQuery,
  ): Promise<{
    items: MaintenanceRecordWithType[];
    page: number;
    pageSize: number;
    total: number;
  }> {
    await this.assertActiveScooter(scooterId);
    const where: Prisma.MaintenanceRecordWhereInput = {
      scooterId,
      maintenanceTypeId: query.maintenanceTypeId,
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.maintenanceRecord.count({ where }),
      this.prisma.maintenanceRecord.findMany({
        where,
        include: { maintenanceType: true },
        orderBy: [{ performedAt: "desc" }, { createdAt: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async createRecord(
    scooterId: string,
    input: v1.maintenance.CreateMaintenanceRecordInput,
    recordedByUserId: string,
  ): Promise<MaintenanceRecordWithType> {
    await this.assertActiveScooter(scooterId);
    const maintenanceType = await this.assertActiveMaintenanceType(
      input.maintenanceTypeId,
    );
    const performedAt = toDateOnlyDate(input.performedAt)!;
    const deadlines = calculateNextDeadlines({
      performedKm: input.performedKm,
      performedAt,
      intervalKm: maintenanceType.intervalKm,
      intervalMonths: maintenanceType.intervalMonths,
      nextDueKm: input.nextDueKm,
      nextDueAt:
        input.nextDueAt === undefined
          ? undefined
          : toDateOnlyDate(input.nextDueAt)!,
    });
    this.assertValidDeadlines(
      input.performedKm,
      performedAt,
      deadlines.nextDueKm,
      deadlines.nextDueAt,
    );

    return this.prisma.$transaction(async (transaction) => {
      const record = await transaction.maintenanceRecord.create({
        data: {
          scooterId,
          maintenanceTypeId: input.maintenanceTypeId,
          performedAt,
          performedKm: input.performedKm,
          notes: input.notes ?? null,
          nextDueKm: deadlines.nextDueKm,
          nextDueAt: deadlines.nextDueAt,
          recordedByUserId,
        },
        include: { maintenanceType: true },
      });
      await this.advanceScooterMileage(
        transaction,
        scooterId,
        input.performedKm,
      );
      return record;
    });
  }

  async updateRecord(
    scooterId: string,
    recordId: string,
    input: v1.maintenance.UpdateMaintenanceRecordInput,
  ): Promise<MaintenanceRecordWithType> {
    await this.assertActiveScooter(scooterId);
    const existing = await this.prisma.maintenanceRecord.findFirst({
      where: { id: recordId, scooterId },
    });
    if (!existing) {
      throw new NotFoundException("Maintenance record not found");
    }
    if (
      input.maintenanceTypeId !== undefined &&
      input.maintenanceTypeId !== existing.maintenanceTypeId
    ) {
      await this.assertActiveMaintenanceType(input.maintenanceTypeId);
    }

    const performedAt =
      input.performedAt === undefined
        ? existing.performedAt
        : toDateOnlyDate(input.performedAt)!;
    const performedKm = input.performedKm ?? existing.performedKm;
    const nextDueKm =
      input.nextDueKm === undefined ? existing.nextDueKm : input.nextDueKm;
    const nextDueAt =
      input.nextDueAt === undefined
        ? existing.nextDueAt
        : (toDateOnlyDate(input.nextDueAt) ?? null);
    this.assertValidDeadlines(performedKm, performedAt, nextDueKm, nextDueAt);

    return this.prisma.$transaction(async (transaction) => {
      const record = await transaction.maintenanceRecord.update({
        where: { id: recordId },
        data: {
          maintenanceTypeId: input.maintenanceTypeId,
          performedAt:
            input.performedAt === undefined ? undefined : performedAt,
          performedKm: input.performedKm,
          notes: input.notes,
          nextDueKm: input.nextDueKm,
          nextDueAt: input.nextDueAt === undefined ? undefined : nextDueAt,
        },
        include: { maintenanceType: true },
      });
      if (input.performedKm !== undefined) {
        await this.advanceScooterMileage(
          transaction,
          scooterId,
          input.performedKm,
        );
      }
      return record;
    });
  }

  private async assertActiveScooter(scooterId: string): Promise<void> {
    const scooter = await this.prisma.scooter.findFirst({
      where: { id: scooterId, deletedAt: null },
      select: { id: true },
    });
    if (!scooter) {
      throw new NotFoundException("Scooter not found");
    }
  }

  private async assertIssue(
    scooterId: string,
    issueId: string,
  ): Promise<ScooterIssue> {
    const issue = await this.prisma.scooterIssue.findFirst({
      where: { id: issueId, scooterId },
    });
    if (!issue) {
      throw new NotFoundException("Scooter issue not found");
    }
    return issue;
  }

  private async assertActiveMaintenanceType(
    maintenanceTypeId: string,
  ): Promise<MaintenanceType> {
    const maintenanceType = await this.prisma.maintenanceType.findFirst({
      where: { id: maintenanceTypeId, isActive: true },
    });
    if (!maintenanceType) {
      throw new NotFoundException("Maintenance type not found");
    }
    return maintenanceType;
  }

  private assertValidDeadlines(
    performedKm: number,
    performedAt: Date,
    nextDueKm: number | null,
    nextDueAt: Date | null,
  ): void {
    if (
      nextDueKm !== null &&
      (nextDueKm <= performedKm || nextDueKm > MAX_DATABASE_INT)
    ) {
      throw new BadRequestException(
        "Next due mileage must be greater than performed mileage and fit the database range",
      );
    }
    if (nextDueAt !== null && nextDueAt <= performedAt) {
      throw new BadRequestException(
        "Next due date must be after the performed date",
      );
    }
  }

  private async advanceScooterMileage(
    transaction: Prisma.TransactionClient,
    scooterId: string,
    performedKm: number,
  ): Promise<void> {
    // Retroactive service entries are valid history. They can advance a
    // scooter's known mileage but never move it backwards.
    await transaction.scooter.updateMany({
      where: {
        id: scooterId,
        deletedAt: null,
        OR: [
          { currentMileageKm: null },
          { currentMileageKm: { lt: performedKm } },
        ],
      },
      data: { currentMileageKm: performedKm },
    });
  }
}
