import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";
import { AccessService } from "../access/access.service";
import {
  accessibleWhere,
  assignedProblemWhere,
  unassignedProblemWhere,
} from "../access/access.ability";
import { AuditService } from "../audit/audit.service";
import { AuditEventType } from "../audit/audit.types";
import { Prisma } from "../generated/prisma/client";
import { ProblemPhotosService } from "./problem-photos.service";
import { PrismaService } from "../prisma/prisma.service";

export const maintenanceScooterSelect = {
  id: true,
  fleetNumber: true,
  model: true,
  registrationNumber: true,
  brand: { select: { name: true, code: true } },
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
    brandCode: row.brand.code,
  };
}

const memberSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} as const;
const assigneeSelect = {
  ...memberSelect,
  isSuperAdmin: true,
  roleMemberships: {
    where: { role: { archivedAt: null } },
    select: { role: { select: { name: true } } },
  },
} as const satisfies Prisma.UserSelect;

function assigneeSummary(
  user: Prisma.UserGetPayload<{ select: typeof assigneeSelect }>,
) {
  const { roleMemberships, ...member } = user;
  return {
    ...member,
    roles: roleMemberships.map(({ role }) => role.name).sort(),
  };
}
const problemInclude = {
  reporter: { select: memberSelect },
  assignee: { select: memberSelect },
  assignees: { select: memberSelect, orderBy: { id: "asc" } },
  photos: {
    where: { asset: { deletedAt: null } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
  scooter: {
    select: {
      ...maintenanceScooterSelect,
      photos: {
        where: {
          deletedAt: null,
          type: "GALLERY_COVER",
          asset: { deletedAt: null },
        },
        select: { id: true },
        take: 1,
      },
    },
  },
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
    private readonly photos: ProblemPhotosService,
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
      (v1.problems
        .problemAssignees(row)
        .some((member) => member.id === snapshot.userId) &&
        snapshot.effectiveScopes["problems.read"]?.includes("ASSIGNED"));
    return v1.problems.problemSchema.parse({
      id: row.id,
      scooterId: row.scooterId,
      scooter: {
        ...toMaintenanceScooter(row.scooter),
        coverUrl: row.scooter.photos?.[0]
          ? v1.scooters.ROUTES.photos.content(
              row.scooterId,
              row.scooter.photos[0].id,
            )
          : null,
      },
      title: row.title,
      description: row.description,
      checklist: row.checklist,
      sections: row.sections,
      buyList: row.buyList,
      location: row.location,
      difficulty: row.difficulty,
      legacySeverity: row.severity,
      blocksUsage: row.blocksUsage,
      holdClearedAt: row.holdClearedAt?.toISOString() ?? null,
      photos: row.photos.map((photo) => ({
        id: photo.id,
        fileName: photo.fileName,
        contentUrl: `/v1/problems/${row.id}/photos/${photo.id}/content`,
        createdAt: photo.createdAt.toISOString(),
      })),
      assignee: row.assignee,
      assignees: v1.problems.problemAssignees(row),
      ...(full ? { reporter: row.reporter } : {}),
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
          .filter((row) => openStates.includes(row.status))
          .flatMap((row) =>
            v1.problems.problemAssignees(row).map((member) => member.id),
          ),
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
        openStates.includes(row.status) &&
        v1.problems
          .problemAssignees(row)
          .some((member) => !eligible.get(member.id)),
    }));
  }

  async list(userId: string, query: v1.problems.ListProblemsQuery) {
    const snapshot = await this.access.getSnapshot(userId);
    const where: Prisma.ScooterProblemWhereInput = {
      AND: [
        this.where(snapshot, "problems.read"),
        query.view === "assigned"
          ? assignedProblemWhere(userId)
          : query.view === "available"
            ? { ...unassignedProblemWhere, status: "open" }
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
          ...(query.difficulty ? { difficulty: query.difficulty } : {}),
          ...(query.assigneeIds?.length
            ? {
                OR: [
                  { assigneeId: { in: query.assigneeIds } },
                  { assignees: { some: { id: { in: query.assigneeIds } } } },
                  ...(query.unassigned ? [unassignedProblemWhere] : []),
                ],
              }
            : query.assigneeId
              ? assignedProblemWhere(query.assigneeId)
              : query.unassigned
                ? unassignedProblemWhere
                : {}),
          ...(query.blocking !== undefined
            ? { blocksUsage: query.blocking }
            : {}),
        },
      ],
    };
    const countWhere: Prisma.ScooterProblemWhereInput = {
      AND: [
        this.where(snapshot, "problems.read"),
        {
          ...(query.scooterId ? { scooterId: query.scooterId } : {}),
          ...(query.difficulty ? { difficulty: query.difficulty } : {}),
          ...(query.blocking !== undefined
            ? { blocksUsage: query.blocking }
            : {}),
        },
      ],
    };
    const [items, total, all, open, inProgress, mine, resolved] =
      await this.prisma.$transaction([
        this.prisma.scooterProblem.findMany({
          where,
          include: problemInclude,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.prisma.scooterProblem.count({ where }),
        this.prisma.scooterProblem.count({ where: countWhere }),
        this.prisma.scooterProblem.count({
          where: { AND: [countWhere, { status: "open" }] },
        }),
        this.prisma.scooterProblem.count({
          where: { AND: [countWhere, { status: "in_progress" }] },
        }),
        this.prisma.scooterProblem.count({
          where: { AND: [countWhere, assignedProblemWhere(userId)] },
        }),
        this.prisma.scooterProblem.count({
          where: { AND: [countWhere, { status: "resolved" }] },
        }),
      ]);
    return {
      items: await this.project(items, snapshot),
      total,
      page: query.page,
      pageSize: query.pageSize,
      quickFilterCounts: { all, open, in_progress: inProgress, mine, resolved },
    };
  }

  async filterOptions(userId: string) {
    const snapshot = await this.access.getSnapshot(userId);
    const visible = this.where(snapshot, "problems.read");
    const [scooters, assignees] = await Promise.all([
      this.prisma.scooter.findMany({
        where: { deletedAt: null, problems: { some: visible } },
        select: maintenanceScooterSelect,
        orderBy: { fleetNumber: "asc" },
      }),
      this.prisma.user.findMany({
        where: {
          OR: [
            { assignedProblems: { some: visible } },
            { problemAssignments: { some: visible } },
          ],
        },
        select: assigneeSelect,
        orderBy: [{ firstName: "asc" }, { id: "asc" }],
      }),
    ]);
    return {
      scooters: scooters.map(toMaintenanceScooter),
      assignees: assignees.map(assigneeSummary),
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
    this.requireAll(await this.access.getSnapshot(userId), "problems.create");
    const prepared = await this.photos.prepare(userId, input.photos);
    return this.prisma.$transaction(async (tx) => {
      const snapshot = await this.access.getSnapshot(userId, tx);
      this.requireAll(snapshot, "problems.create");
      await tx.$queryRaw`SELECT id FROM "Scooter" WHERE id = ${input.scooterId} FOR UPDATE`;
      const scooter = await tx.scooter.findFirst({
        where: {
          AND: [
            { id: input.scooterId, deletedAt: null },
            accessibleWhere(snapshot, "scooters.read", "Scooter"),
          ],
        },
        select: { id: true },
      });
      if (!scooter) throw new NotFoundException("Scooter not found");
      const assigneeIds =
        input.assigneeIds ?? (input.assigneeId ? [input.assigneeId] : []);
      if (assigneeIds.length) {
        this.requireAll(snapshot, "problems.assign");
        for (const assigneeId of assigneeIds) {
          if (!(await this.eligible(assigneeId, tx)))
            throw new ConflictException(
              "Assignee is not eligible for problem work",
            );
        }
      }
      let location = input.location;
      if (location?.savedLocationId) {
        const saved = await tx.businessLocation.findUnique({
          where: { id: location.savedLocationId },
        });
        if (!saved) throw new BadRequestException("Saved location not found");
        location = {
          name: saved.name,
          address: saved.address,
          savedLocationId: saved.id,
        };
      }
      const data = {
        ...(input.checklist !== undefined
          ? { checklist: input.checklist }
          : {}),
        ...(input.sections !== undefined ? { sections: input.sections } : {}),
        ...(input.buyList !== undefined ? { buyList: input.buyList } : {}),
        ...(location !== undefined
          ? { location: location ?? Prisma.DbNull }
          : {}),
        scooterId: input.scooterId,
        title: input.title,
        description: input.description,
        difficulty: input.difficulty,
        blocksUsage: input.blocksUsage,
        assigneeId: assigneeIds[0] ?? null,
        assignees: { connect: assigneeIds.map((id) => ({ id })) },
      };
      const created = await tx.scooterProblem.create({
        data: { ...data, reporterId: userId },
        include: problemInclude,
      });
      await this.photos.attach(tx, created.id, userId, prepared);
      const row = await tx.scooterProblem.findUniqueOrThrow({
        where: { id: created.id },
        include: problemInclude,
      });
      await this.audit.recordRequired(tx, {
        type: AuditEventType.PROBLEM_CREATED,
        userId,
        targetType: "ScooterProblem",
        targetId: row.id,
        meta: {
          scooterId: row.scooterId,
          after: {
            checklist: row.checklist,
            sections: row.sections,
            buyList: row.buyList,
            location: row.location,
            title: row.title,
            status: row.status,
            difficulty: row.difficulty,
            blocksUsage: row.blocksUsage,
            assigneeId: row.assigneeId,
            assignee: row.assignee,
            assignees: v1.problems.problemAssignees(row),
          },
        },
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
      select: assigneeSelect,
    });
    if (!user) return null;
    const snapshot = await this.access.getSnapshot(userId, tx);
    const permits = (action: string) =>
      snapshot.isSuperAdmin ||
      snapshot.effectiveScopes[action]?.some(
        (scope) => scope === "ASSIGNED" || scope === "ALL",
      );
    return permits("problems.read") &&
      permits("problems.update") &&
      permits("problems.resolve")
      ? assigneeSummary(user)
      : null;
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
                { email: { contains: search, mode: "insensitive" as const } },
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
    return v1.problems.eligibleAssigneeListSchema.parse({
      items: eligible.filter((user) => user !== null),
    });
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
      // Match rental writers: scooter first, then the problem. All hold changes share this lock.
      const reference = await tx.scooterProblem.findUnique({
        where: { id },
        select: { scooterId: true },
      });
      if (!reference) throw new NotFoundException("Problem not found");
      await tx.$queryRaw`SELECT id FROM "Scooter" WHERE id = ${reference.scooterId} FOR UPDATE`;
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
      const { assignees, ...data } = await change(row, snapshot, tx);
      const result = await tx.scooterProblem.updateMany({
        where: { id, revision, assigneeId: row.assigneeId, status: row.status },
        data: { ...data, revision: { increment: 1 } },
      });
      if (result.count !== 1)
        throw new ConflictException("Problem changed; reload before saving");
      if (assignees) {
        await tx.scooterProblem.update({ where: { id }, data: { assignees } });
      }
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
            assignee: row.assignee,
            assignees: v1.problems.problemAssignees(row),
            priority: row.priority,
            revision: row.revision,
            title: row.title,
            description: row.description,
            checklist: row.checklist,
            sections: row.sections,
            buyList: row.buyList,
            location: row.location,
            difficulty: row.difficulty,
            blocksUsage: row.blocksUsage,
            resolutionNotes: row.resolutionNotes,
          },
          after: {
            status: updated.status,
            assigneeId: updated.assigneeId,
            assignee: updated.assignee,
            assignees: v1.problems.problemAssignees(updated),
            priority: updated.priority,
            revision: updated.revision,
            title: updated.title,
            description: updated.description,
            checklist: updated.checklist,
            sections: updated.sections,
            buyList: updated.buyList,
            location: updated.location,
            difficulty: updated.difficulty,
            blocksUsage: updated.blocksUsage,
            resolutionNotes: updated.resolutionNotes,
            workNotes: updated.workNotes,
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
        if (
          row.status !== "open" ||
          v1.problems.problemAssignees(row).length ||
          row.assigneeId !== null
        )
          throw new ConflictException("Problem is no longer available");
        if (!(await this.eligible(userId, tx)))
          throw new ForbiddenException(
            "Assigned-work permissions are required to claim work",
          );
        return { assigneeId: userId, assignees: { set: [{ id: userId }] } };
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
      async (row, snapshot, tx) => {
        if (!openStates.includes(row.status))
          throw new ConflictException("Only open work can be updated");
        if (
          (input.checklist !== undefined ||
            input.sections !== undefined ||
            input.buyList !== undefined ||
            input.location !== undefined) &&
          !snapshot.isSuperAdmin &&
          !snapshot.effectiveScopes["problems.update"]?.includes("ALL") &&
          !v1.problems
            .problemAssignees(row)
            .some((member) => member.id === userId)
        )
          throw new ForbiddenException(
            "Only admins and the assignee can edit task sections",
          );
        let location = input.location;
        if (location?.savedLocationId) {
          const saved = await tx.businessLocation.findUnique({
            where: { id: location.savedLocationId },
          });
          if (!saved) throw new BadRequestException("Saved location not found");
          location = {
            name: saved.name,
            address: saved.address,
            savedLocationId: saved.id,
          };
        }
        if (input.photos?.length) {
          if (
            row.photos.length + input.photos.length >
            v1.problems.PROBLEM_PHOTO_MAX_FILES
          )
            throw new BadRequestException("Too many problem photos");
          const photos = await this.photos.prepare(userId, input.photos);
          await this.photos.attach(tx, id, userId, photos);
        }
        if (input.startWork && !v1.problems.problemAssignees(row).length)
          throw new ConflictException(
            "Assign the problem before starting work",
          );
        return {
          ...(input.sections !== undefined ? { sections: input.sections } : {}),
          ...(input.buyList !== undefined ? { buyList: input.buyList } : {}),
          ...(location !== undefined
            ? { location: location ?? Prisma.DbNull }
            : {}),
          ...(input.checklist !== undefined
            ? { checklist: input.checklist }
            : {}),
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.difficulty !== undefined
            ? { difficulty: input.difficulty }
            : {}),
          ...(input.workNotes !== undefined
            ? { workNotes: input.workNotes }
            : {}),
          ...(input.startWork ? { status: "in_progress" } : {}),
        };
      },
    );
  }

  async locations() {
    return {
      items: await this.prisma.businessLocation.findMany({
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
    };
  }

  async saveLocation(input: { name: string; address: string }) {
    return this.prisma.businessLocation.upsert({
      where: { name_address: input },
      create: input,
      update: {},
    });
  }

  async createPhotoUpload(
    userId: string,
    id: string,
    input: v1.scooters.CreateScooterPhotoUpload,
  ) {
    const snapshot = await this.access.getSnapshot(userId);
    const row = await this.prisma.scooterProblem.findFirst({
      where: { AND: [{ id }, this.where(snapshot, "problems.update")] },
      select: { id: true, status: true },
    });
    if (!row)
      throw new NotFoundException(
        "Problem not found or no longer assigned to you",
      );
    if (!openStates.includes(row.status))
      throw new ConflictException("Only open work can be updated");
    return this.photos.createUpload(userId, input);
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
          ...this.closeHold(row, userId, input.clearMaintenanceHold),
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
        const assigneeIds =
          input.assigneeIds ?? (input.assigneeId ? [input.assigneeId] : []);
        for (const assigneeId of assigneeIds) {
          if (!(await this.eligible(assigneeId, tx)))
            throw new ConflictException(
              "Assignee is not eligible for mechanic work",
            );
        }
        return {
          assigneeId: assigneeIds[0] ?? null,
          assignees: { set: assigneeIds.map((id) => ({ id })) },
        };
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
        if (row.status !== "resolved" && row.status !== "cancelled")
          throw new ConflictException("Only closed work can be reopened");
        return {
          status: "open",
          resolvedAt: null,
        };
      },
    );
  }

  cancel(
    userId: string,
    id: string,
    revision: number,
    clearMaintenanceHold?: boolean,
  ) {
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
        return {
          ...this.closeHold(row, userId, clearMaintenanceHold),
          status: "cancelled",
        };
      },
    );
  }

  private closeHold(
    row: ProblemRow,
    userId: string,
    clear?: boolean,
  ): Prisma.ScooterProblemUncheckedUpdateInput {
    if (row.blocksUsage && clear === undefined)
      throw new ConflictException(
        "Choose whether to clear or retain this problem's maintenance hold",
      );
    return row.blocksUsage && clear
      ? {
          blocksUsage: false,
          holdClearedAt: new Date(),
          holdClearedById: userId,
        }
      : {};
  }

  hold(userId: string, id: string, input: v1.problems.ProblemHoldInput) {
    return this.mutate(
      userId,
      id,
      input.revision,
      "problems.update",
      AuditEventType.PROBLEM_HOLD_CHANGED,
      () => ({
        blocksUsage: input.blocksUsage,
        holdClearedAt: input.blocksUsage ? null : new Date(),
        holdClearedById: input.blocksUsage ? null : userId,
      }),
    );
  }

  async maintenanceHold(userId: string, scooterId: string) {
    await this.scooter(userId, scooterId);
    // Holds are safety information: show every blocker, even when the member only works assigned reports.
    const blockers = await this.prisma.scooterProblem.findMany({
      where: { scooterId, blocksUsage: true },
      select: { id: true, title: true, status: true, difficulty: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return v1.problems.maintenanceHoldSchema.parse({
      onHold: blockers.length > 0,
      count: blockers.length,
      blockers,
    });
  }

  async comment(
    userId: string,
    id: string,
    input: v1.problems.ProblemCommentInput,
  ) {
    return this.prisma
      .$transaction(async (tx) => {
        const snapshot = await this.access.getSnapshot(userId, tx);
        const row = await tx.scooterProblem.findFirst({
          where: {
            AND: [
              { id },
              this.where(snapshot, "problems.update"),
              this.where(snapshot, "problems.read"),
            ],
          },
          select: { id: true, revision: true },
        });
        if (!row)
          throw new NotFoundException(
            "Problem not found or no longer assigned to you",
          );
        const written = await tx.scooterProblem.updateMany({
          where: {
            AND: [
              { id, revision: input.revision },
              this.where(snapshot, "problems.update"),
            ],
          },
          data: { revision: { increment: 1 } },
        });
        if (written.count !== 1)
          throw new ConflictException("Problem changed; reload before saving");
        await this.audit.recordRequired(tx, {
          type: AuditEventType.PROBLEM_COMMENTED,
          userId,
          targetType: "ScooterProblem",
          targetId: id,
          meta: { note: input.body },
        });
      })
      .then(() => this.get(userId, id));
  }

  async activity(userId: string, id: string, query: v1.problems.ActivityQuery) {
    const problem = await this.get(userId, id);
    const full = problem.reporter !== undefined;
    const where = {
      targetType: "ScooterProblem",
      targetId: id,
      type: { in: [...v1.problems.problemActivityTypeSchema.options] },
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditEvent.findMany({
        where,
        include: { user: { select: memberSelect } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditEvent.count({ where }),
    ]);
    return v1.problems.problemActivityListSchema.parse({
      total,
      ...query,
      items: rows.map((row) => {
        const meta =
          row.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
            ? row.meta
            : {};
        const before = v1.problems.problemActivityStateSchema.safeParse(
          meta.before,
        );
        const after = v1.problems.problemActivityStateSchema.safeParse(
          meta.after,
        );
        const notes =
          meta.note ??
          (row.type === AuditEventType.PROBLEM_RESOLVED
            ? (meta.after as Prisma.JsonObject | undefined)?.resolutionNotes
            : row.type === AuditEventType.PROBLEM_UPDATED
              ? (meta.after as Prisma.JsonObject | undefined)?.workNotes
              : null);
        return {
          id: row.id,
          type: row.type,
          actor: full ? row.user : null,
          createdAt: row.createdAt.toISOString(),
          note: full && typeof notes === "string" ? notes : null,
          before: before.success ? before.data : null,
          after: after.success ? after.data : null,
        };
      }),
    });
  }
}
