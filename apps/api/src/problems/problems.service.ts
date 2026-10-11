import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";
import { AccessService } from "../access/access.service";
import { accessibleWhere } from "../access/access.ability";
import { AuditService } from "../audit/audit.service";
import { AuditEventType } from "../audit/audit.types";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export const maintenanceScooterSelect = {
  id: true,
  fleetNumber: true,
  model: true,
  registrationNumber: true,
  brand: { select: { name: true } },
} satisfies Prisma.ScooterSelect;

export function toMaintenanceScooter(
  row: Prisma.ScooterGetPayload<{ select: typeof maintenanceScooterSelect }>,
) {
  return {
    id: row.id,
    fleetNumber: row.fleetNumber,
    model: row.model,
    registrationNumber: row.registrationNumber,
    brandName: row.brand.name,
  };
}

const problemInclude = {
  scooter: { select: maintenanceScooterSelect },
} satisfies Prisma.ScooterProblemInclude;
type ProblemRow = Prisma.ScooterProblemGetPayload<{
  include: typeof problemInclude;
}>;
type Snapshot = Awaited<ReturnType<AccessService["getSnapshot"]>>;
type ProblemAction =
  | "problems.read"
  | "problems.create"
  | "problems.update"
  | "problems.resolve"
  | "problems.claim"
  | "problems.assign"
  | "problems.prioritize"
  | "problems.reopen";
const openStates = ["open", "in_progress"];

@Injectable()
export class ProblemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  private where(
    snapshot: Snapshot,
    key: ProblemAction,
  ): Prisma.ScooterProblemWhereInput {
    return {
      AND: [
        accessibleWhere(snapshot, key, "ScooterProblem"),
        { scooter: { deletedAt: null } },
      ],
    };
  }

  private dto(row: ProblemRow, snapshot: Snapshot) {
    const full =
      snapshot.isSuperAdmin ||
      snapshot.effectiveScopes["problems.read"]?.includes("ALL") ||
      (row.assigneeId === snapshot.userId &&
        snapshot.effectiveScopes["problems.read"]?.includes("ASSIGNED"));
    return v1.problems.problemSchema.parse({
      id: row.id,
      scooterId: row.scooterId,
      scooter: toMaintenanceScooter(row.scooter),
      description: row.description,
      priority: row.priority,
      status: row.status,
      assigneeId: row.assigneeId,
      revision: row.revision,
      ...(full
        ? { workNotes: row.workNotes, resolutionNotes: row.resolutionNotes }
        : {}),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
    });
  }

  private async project(rows: ProblemRow[], snapshot: Snapshot) {
    const results = rows.map((row) => this.dto(row, snapshot));
    if (
      !snapshot.isSuperAdmin &&
      !snapshot.effectiveScopes["problems.assign"]?.includes("ALL")
    )
      return results;
    const ids = [
      ...new Set(
        rows
          .filter((row) => openStates.includes(row.status) && row.assigneeId)
          .map((row) => row.assigneeId!),
      ),
    ];
    const eligible = new Map(
      await Promise.all(
        ids.map(async (id) => [id, !!(await this.eligible(id))] as const),
      ),
    );
    return results.map((row) => ({
      ...row,
      assigneeNeedsReassignment:
        !!row.assigneeId &&
        openStates.includes(row.status) &&
        !eligible.get(row.assigneeId),
    }));
  }

  async list(userId: string, query: v1.problems.ListProblemsQuery) {
    const snapshot = await this.access.getSnapshot(userId);
    const where: Prisma.ScooterProblemWhereInput = {
      AND: [
        this.where(snapshot, "problems.read"),
        query.view === "assigned"
          ? { assigneeId: userId }
          : query.view === "available"
            ? { assigneeId: null, status: "open" }
            : {},
        ...(query.view === "all"
          ? [
              snapshot.isSuperAdmin ||
              snapshot.effectiveScopes["problems.read"]?.includes("ALL")
                ? {}
                : { id: { in: [] } },
            ]
          : []),
        {
          ...(query.status ? { status: query.status } : {}),
          ...(query.scooterId ? { scooterId: query.scooterId } : {}),
        },
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.scooterProblem.findMany({
        where,
        include: problemInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.scooterProblem.count({ where }),
    ]);
    return {
      items: await this.project(items, snapshot),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(userId: string, id: string) {
    const snapshot = await this.access.getSnapshot(userId);
    const row = await this.prisma.scooterProblem.findFirst({
      where: { AND: [{ id }, this.where(snapshot, "problems.read")] },
      include: problemInclude,
    });
    if (!row) throw new NotFoundException("Problem not found");
    return (await this.project([row], snapshot))[0];
  }

  async scooter(userId: string, id: string) {
    const snapshot = await this.access.getSnapshot(userId);
    const row = await this.prisma.scooter.findFirst({
      where: {
        AND: [
          { id, deletedAt: null },
          accessibleWhere(snapshot, "scooters.read", "Scooter"),
        ],
      },
      select: maintenanceScooterSelect,
    });
    if (!row) throw new NotFoundException("Scooter not found");
    return toMaintenanceScooter(row);
  }

  async create(userId: string, input: v1.problems.CreateProblemInput) {
    return this.prisma.$transaction(async (tx) => {
      const snapshot = await this.access.getSnapshot(userId, tx);
      this.requireAll(snapshot, "problems.create");
      const scooter = await tx.scooter.findFirst({
        where: { id: input.scooterId, deletedAt: null },
        select: { id: true },
      });
      if (!scooter) throw new NotFoundException("Scooter not found");
      const row = await tx.scooterProblem.create({
        data: { ...input, reporterId: userId },
        include: problemInclude,
      });
      await this.audit.recordRequired(tx, {
        type: AuditEventType.PROBLEM_CREATED,
        userId,
        targetType: "ScooterProblem",
        targetId: row.id,
        meta: { scooterId: row.scooterId, status: row.status },
      });
      return this.dto(row, snapshot);
    });
  }

  private requireAll(snapshot: Snapshot, action: ProblemAction) {
    if (
      !snapshot.isSuperAdmin &&
      !snapshot.effectiveScopes[action]?.includes("ALL")
    )
      throw new ForbiddenException("Permission required");
  }

  private async eligible(userId: string, tx?: Prisma.TransactionClient) {
    const user = await (tx ?? this.prisma).user.findFirst({
      where: { id: userId, deletedAt: null, loginStatus: "ACTIVE" },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!user) return null;
    const snapshot = await this.access.getSnapshot(userId, tx);
    const permits = (action: string) =>
      snapshot.isSuperAdmin ||
      snapshot.effectiveScopes[action]?.some(
        (scope) => scope === "ASSIGNED" || scope === "ALL",
      );
    return permits("problems.read") && permits("problems.update") ? user : null;
  }

  async assignees(userId: string, search: string) {
    this.requireAll(await this.access.getSnapshot(userId), "problems.assign");
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        loginStatus: "ACTIVE",
        ...(search
          ? {
              OR: [
                {
                  firstName: { contains: search, mode: "insensitive" as const },
                },
                {
                  lastName: { contains: search, mode: "insensitive" as const },
                },
              ],
            }
          : {}),
      },
      select: { id: true },
      orderBy: [{ firstName: "asc" }, { id: "asc" }],
      take: 100,
    });
    const eligible = await Promise.all(
      users.map((user) => this.eligible(user.id)),
    );
    return { items: eligible.filter((user) => user !== null) };
  }

  private async mutate(
    userId: string,
    id: string,
    revision: number,
    action: ProblemAction,
    event: AuditEventType,
    change: (
      row: ProblemRow,
      snapshot: Snapshot,
      tx: Prisma.TransactionClient,
    ) =>
      | Promise<Prisma.ScooterProblemUncheckedUpdateInput>
      | Prisma.ScooterProblemUncheckedUpdateInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ScooterProblem" WHERE id = ${id} FOR UPDATE`;
      const snapshot = await this.access.getSnapshot(userId, tx);
      const row = await tx.scooterProblem.findFirst({
        where: { AND: [{ id }, this.where(snapshot, action)] },
        include: problemInclude,
      });
      if (!row) {
        if (action === "problems.claim")
          throw new ConflictException("Problem is no longer available");
        throw new NotFoundException(
          "Problem not found or no longer assigned to you",
        );
      }
      if (row.revision !== revision)
        throw new ConflictException("Problem changed; reload before saving");
      const data = await change(row, snapshot, tx);
      const result = await tx.scooterProblem.updateMany({
        where: { id, revision, assigneeId: row.assigneeId, status: row.status },
        data: { ...data, revision: { increment: 1 } },
      });
      if (result.count !== 1)
        throw new ConflictException("Problem changed; reload before saving");
      const updated = await tx.scooterProblem.findUniqueOrThrow({
        where: { id },
        include: problemInclude,
      });
      await this.audit.recordRequired(tx, {
        type: event,
        userId,
        targetType: "ScooterProblem",
        targetId: id,
        meta: {
          before: {
            status: row.status,
            assigneeId: row.assigneeId,
            priority: row.priority,
            revision: row.revision,
          },
          after: {
            status: updated.status,
            assigneeId: updated.assigneeId,
            priority: updated.priority,
            revision: updated.revision,
          },
        },
      });
      return this.dto(updated, snapshot);
    });
  }

  claim(userId: string, id: string, revision: number) {
    return this.mutate(
      userId,
      id,
      revision,
      "problems.claim",
      AuditEventType.PROBLEM_CLAIMED,
      async (row, _snapshot, tx) => {
        if (row.status !== "open" || row.assigneeId !== null)
          throw new ConflictException("Problem is no longer available");
        if (!(await this.eligible(userId, tx)))
          throw new ForbiddenException(
            "Assigned-work permissions are required to claim work",
          );
        return { assigneeId: userId };
      },
    );
  }

  update(userId: string, id: string, input: v1.problems.UpdateProblemInput) {
    return this.mutate(
      userId,
      id,
      input.revision,
      "problems.update",
      AuditEventType.PROBLEM_UPDATED,
      (row) => {
        if (!openStates.includes(row.status))
          throw new ConflictException("Only open work can be updated");
        if (input.startWork && !row.assigneeId)
          throw new ConflictException(
            "Assign the problem before starting work",
          );
        return {
          ...(input.workNotes !== undefined
            ? { workNotes: input.workNotes }
            : {}),
          ...(input.startWork ? { status: "in_progress" } : {}),
        };
      },
    );
  }

  resolve(userId: string, id: string, input: v1.problems.ResolveProblemInput) {
    return this.mutate(
      userId,
      id,
      input.revision,
      "problems.resolve",
      AuditEventType.PROBLEM_RESOLVED,
      (row) => {
        if (!openStates.includes(row.status))
          throw new ConflictException("Problem is already closed");
        return {
          status: "resolved",
          resolutionNotes: input.resolutionNotes,
          resolvedAt: new Date(),
        };
      },
    );
  }

  assign(userId: string, id: string, input: v1.problems.AssignProblemInput) {
    return this.mutate(
      userId,
      id,
      input.revision,
      "problems.assign",
      AuditEventType.PROBLEM_ASSIGNED,
      async (row, snapshot, tx) => {
        this.requireAll(snapshot, "problems.assign");
        if (!openStates.includes(row.status))
          throw new ConflictException("Only open work can be assigned");
        if (input.assigneeId && !(await this.eligible(input.assigneeId, tx)))
          throw new ConflictException(
            "Assignee is not eligible for mechanic work",
          );
        return { assigneeId: input.assigneeId, status: "open" };
      },
    );
  }

  prioritize(
    userId: string,
    id: string,
    input: v1.problems.PrioritizeProblemInput,
  ) {
    return this.mutate(
      userId,
      id,
      input.revision,
      "problems.prioritize",
      AuditEventType.PROBLEM_PRIORITIZED,
      (_row, snapshot) => {
        this.requireAll(snapshot, "problems.prioritize");
        return { priority: input.priority };
      },
    );
  }

  reopen(userId: string, id: string, revision: number) {
    return this.mutate(
      userId,
      id,
      revision,
      "problems.reopen",
      AuditEventType.PROBLEM_REOPENED,
      (row, snapshot) => {
        this.requireAll(snapshot, "problems.reopen");
        if (row.status !== "resolved")
          throw new ConflictException("Only resolved work can be reopened");
        return {
          status: "open",
          assigneeId: null,
          resolvedAt: null,
          resolutionNotes: null,
        };
      },
    );
  }

  cancel(userId: string, id: string, revision: number) {
    return this.mutate(
      userId,
      id,
      revision,
      "problems.update",
      AuditEventType.PROBLEM_CANCELLED,
      (row, snapshot) => {
        this.requireAll(snapshot, "problems.update");
        if (!openStates.includes(row.status))
          throw new ConflictException("Problem is already closed");
        return { status: "cancelled" };
      },
    );
  }
}
