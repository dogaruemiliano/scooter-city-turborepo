import { v1 } from "@repo/api-shared";
import type { Prisma } from "../generated/prisma/client";
import {
  hasNotificationScope,
  notificationUserInclude,
  snapshotForNotificationUser,
} from "./notification-policy";

type SubjectType =
  | "scooter"
  | "rental"
  | "person"
  | "user"
  | "role"
  | "issue"
  | "todo"
  | "expense"
  | "brand"
  | "location"
  | "supplier"
  | "finance"
  | "contract";
type Category =
  | "scooters"
  | "rentals"
  | "persons"
  | "access"
  | "jobs"
  | "expenses"
  | "brands"
  | "other";
export interface PublishNotificationInput {
  id?: string;
  type: string;
  category: Category;
  actorId?: string | null;
  subjectType: SubjectType;
  subjectId: string;
  subjectLabel?: string;
  permissionKey: v1.access.PermissionKey | "super_admin";
  targetPath?: string | null;
  scooterId?: string | null;
  problemId?: string | null;
  changes?: string[];
  assignedIds?: string[];
  removedIds?: string[];
}

const scooterSelect = {
  id: true,
  fleetNumber: true,
  brand: { select: { code: true } },
} as const;
const personName = (
  person: { firstName: string | null; lastName: string | null } | null,
) =>
  [person?.firstName, person?.lastName].filter(Boolean).join(" ").slice(0, 200);
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const stringIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.flatMap((item) =>
        typeof item === "string"
          ? [item]
          : typeof object(item).id === "string"
            ? [object(item).id as string]
            : [],
      )
    : [];
const assigneeIds = (value: unknown): string[] => {
  const row = object(value);
  return [
    ...new Set([
      ...stringIds(row.assignees),
      ...(typeof row.assigneeId === "string" ? [row.assigneeId] : []),
    ]),
  ];
};
const normalizedGrants = (value: unknown, includeReason = false) =>
  Array.isArray(value)
    ? value
        .map((entry) => {
          const grant = object(entry);
          return {
            permissionKey: grant.permissionKey,
            scopes: stringIds(grant.scopes).sort(),
            ...(includeReason ? { reason: grant.reason ?? null } : {}),
          };
        })
        .sort((a, b) =>
          String(a.permissionKey).localeCompare(String(b.permissionKey)),
        )
    : [];

/** The caller supplies the actual business transaction; failures roll it back. */
export async function publishNotificationEvent(
  tx: Prisma.TransactionClient,
  input: PublishNotificationInput,
): Promise<void> {
  const users = await tx.user.findMany({
    where: { deletedAt: null, loginStatus: "ACTIVE" },
    include: notificationUserInclude,
  });
  const adminRecipientIds: string[] = [];
  const assignedRecipientIds: string[] = [];
  const removedRecipientIds: string[] = [];
  const assigned = new Set(input.assignedIds ?? []);
  const removed = new Set(input.removedIds ?? []);
  for (const user of users) {
    if (user.id === input.actorId) continue;
    const snapshot = snapshotForNotificationUser(user);
    const source = snapshot.effectiveScopes[input.permissionKey] ?? [];
    const fullSource = snapshot.isSuperAdmin || source.includes("ALL");
    const todoAllowed =
      input.subjectType !== "todo" || snapshot.isAdmin || snapshot.isSuperAdmin;
    if (todoAllowed && hasNotificationScope(snapshot, "ALL") && fullSource)
      adminRecipientIds.push(user.id);
    if (
      input.subjectType === "issue" &&
      (hasNotificationScope(snapshot, "ASSIGNED") ||
        hasNotificationScope(snapshot, "ALL")) &&
      (fullSource || source.includes("ASSIGNED"))
    ) {
      if (assigned.has(user.id)) assignedRecipientIds.push(user.id);
      if (removed.has(user.id) && !assigned.has(user.id))
        removedRecipientIds.push(user.id);
    }
  }
  const actor = input.actorId
    ? (users.find((user) => user.id === input.actorId) ??
      (await tx.user.findUnique({ where: { id: input.actorId } })))
    : null;
  const scooter = input.scooterId
    ? await tx.scooter.findUnique({
        where: { id: input.scooterId },
        select: scooterSelect,
      })
    : null;
  const scooterSummary = scooter
    ? {
        id: scooter.id,
        fleetNumber: scooter.fleetNumber,
        brandCode: scooter.brand.code,
      }
    : null;
  const subjectLabel =
    input.subjectLabel ??
    (scooterSummary ? v1.scooters.scooterDisplayCode(scooterSummary) : "");
  await tx.notificationEvent.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      type: input.type,
      category: input.category,
      actorId: input.actorId ?? null,
      actorName: personName(actor),
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      subjectLabel: subjectLabel.slice(0, 300),
      permissionKey: input.permissionKey,
      targetPath: input.targetPath ?? null,
      ...(scooterSummary ? { scooter: scooterSummary } : {}),
      problemId: input.problemId ?? null,
      changes: [...new Set(input.changes ?? [])],
      adminRecipientIds,
      assignedRecipientIds,
      removedRecipientIds,
    },
  });
}

interface AuditedEvent {
  type: string;
  userId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  meta?: unknown;
}

/** Only these explicit business audit types enter the notifications pipeline. */
const auditTypes: Readonly<Record<string, string>> = {
  PERSON_CREATED: "person.created",
  PERSON_UPDATED: "person.updated",
  PERSON_DELETED: "person.deleted",
  PERSON_DOCUMENT_CREATED: "person.documents.changed",
  PERSON_DOCUMENT_UPDATED: "person.documents.changed",
  PERSON_DOCUMENT_DELETED: "person.documents.changed",
  PERSON_DOCUMENT_REPLACED: "person.documents.changed",
  RENTAL_CREATED: "rental.created",
  RENTAL_HANDED_OVER: "rental.handed_over",
  RENTAL_RETURNED: "rental.returned",
  RENTAL_CANCELLED: "rental.cancelled",
  RENTAL_DRAFT_SAVED: "rental.updated",
  RENTAL_INSPECTION_SAVED: "rental.inspection.changed",
  RENTAL_INSPECTION_CONFIRMED: "rental.inspection.changed",
  RENTAL_PAYMENT_CONFIRMED: "rental.payment.confirmed",
  SCOOTER_DOCUMENT_VISIBILITY_CHANGED: "scooter.documents.changed",
  SCOOTER_SPEED_CONFIGURATION_CHANGED: "scooter.updated",
  PROBLEM_CREATED: "issue.created",
  PROBLEM_UPDATED: "issue.updated",
  PROBLEM_CLAIMED: "issue.assigned",
  PROBLEM_ASSIGNED: "issue.assigned",
  PROBLEM_RESOLVED: "issue.resolved",
  PROBLEM_REOPENED: "issue.reopened",
  PROBLEM_PRIORITIZED: "issue.priority.changed",
  PROBLEM_CANCELLED: "issue.cancelled",
  PROBLEM_COMMENTED: "issue.commented",
  PROBLEM_HOLD_CHANGED: "issue.hold.changed",
  ACCESS_USER_CREATED: "user.created",
  ACCESS_USER_CHANGED: "user.updated",
  ACCESS_STATUS_CHANGED: "user.status.changed",
  ACCESS_SUPER_ADMIN_CHANGED: "user.permissions.changed",
  ACCESS_CUSTOMER_CHANGED: "user.permissions.changed",
  ACCESS_ROLE_CREATED: "role.created",
  ACCESS_ROLE_CHANGED: "role.updated",
  ACCESS_ROLE_ARCHIVED: "role.archived",
  ACCESS_INVITED: "user.updated",
  ACCESS_INVITATION_CANCELLED: "user.updated",
  CONTRACT_TEMPLATE_CHANGED: "contract.updated",
  CONTRACT_PACKAGE_CHANGED: "contract.updated",
  CONTRACT_SIGNING_EVENT: "contract.updated",
  CONTRACT_DELIVERY_CHANGED: "contract.updated",
  RENTAL_MEDIA_UPLOADED: "rental.updated",
};

const contractBusinessActions = new Set([
  "settings.approved",
  "branding.uploaded",
  "template.created",
  "template.source_uploaded",
  "template.validated",
  "template.approved",
  "template.published",
  "template.archived",
  "template_set.created",
  "template_set.activated",
  "package.created",
  "package.rendered",
  "package.published",
  "package.concluded",
  "identity.reviewed",
  "invitation.created",
  "invitation.sent",
  "signature.recorded",
  "company.signature_recorded",
  "customer.completed",
  "delivery.sent",
  "retention.policy_drafted",
  "retention.policy_approved",
  "retention.hold_created",
  "retention.hold_released",
  "retention.batch_approved",
  "retention.subject_purged",
]);

const changedFields = (before: unknown, after: unknown): string[] => {
  const previous = object(before),
    next = object(after);
  return [...new Set([...Object.keys(previous), ...Object.keys(next)])]
    .filter(
      (key) =>
        ![
          "revision",
          "updatedAt",
          "accessRevision",
          "assignee",
          "assigneeId",
          "assignees",
          "photos",
        ].includes(key),
    )
    .filter(
      (key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key]),
    );
};

/** Called only by required transactional audits, never by best-effort logging. */
export async function publishAuditedNotification(
  tx: Prisma.TransactionClient,
  input: AuditedEvent,
  auditId: string,
): Promise<void> {
  let type = auditTypes[input.type];
  if (!type || !input.targetId) return;
  const id = input.targetId,
    meta = object(input.meta);
  const base = { id: auditId, type, actorId: input.userId, subjectId: id };
  if (input.type.startsWith("PROBLEM_")) {
    const row = await tx.scooterProblem.findUnique({
      where: { id },
      include: { assignees: { select: { id: true } } },
    });
    if (!row) return;
    const before = object(meta.before),
      after = object(meta.after);
    const previousIds = assigneeIds(before),
      currentIds = assigneeIds(row);
    const hasPreviousAssignments =
      before.assignees !== undefined || before.assigneeId !== undefined;
    const changes = changedFields(before, after);
    if (
      JSON.stringify([...previousIds].sort()) !==
        JSON.stringify([...currentIds].sort()) &&
      hasPreviousAssignments
    )
      changes.push("assignees");
    if (JSON.stringify(before.photos) !== JSON.stringify(after.photos))
      changes.push("photos");
    if (input.type === "PROBLEM_UPDATED") {
      if (!changes.length) return;
      if (before.status === "open" && after.status === "in_progress")
        type = "issue.started";
      else if (before.status === "in_progress" && after.status === "open")
        type = "issue.paused";
      else if (changes.length === 1 && changes[0] === "assignees")
        type = "issue.assigned";
    }
    const todo = row.scooterId === null;
    await publishNotificationEvent(tx, {
      ...base,
      type: todo ? type.replace(/^issue\./, "todo.") : type,
      subjectType: todo ? "todo" : "issue",
      category: "jobs",
      permissionKey: "problems.read",
      subjectLabel: row.title,
      problemId: row.id,
      scooterId: row.scooterId,
      targetPath: `/${todo ? "todos" : "problems"}/${id}`,
      changes,
      assignedIds: currentIds,
      removedIds: hasPreviousAssignments
        ? previousIds.filter((userId) => !currentIds.includes(userId))
        : [],
    });
    return;
  }
  if (input.type.startsWith("PERSON_")) {
    const row = await tx.person.findUnique({
      where: { id },
      select: { firstName: true, lastName: true },
    });
    const changes = Array.isArray(meta.changes)
      ? meta.changes.flatMap((change) =>
          typeof object(change).field === "string"
            ? [object(change).field as string]
            : [],
        )
      : [];
    if (input.type === "PERSON_UPDATED" && !changes.length) return;
    await publishNotificationEvent(tx, {
      ...base,
      category: "persons",
      subjectType: "person",
      subjectLabel: personName(row),
      permissionKey: input.type.startsWith("PERSON_DOCUMENT_")
        ? "person_documents.read"
        : "persons.read",
      targetPath: type === "person.deleted" ? null : `/persons/${id}`,
      changes,
    });
    return;
  }
  if (input.type.startsWith("RENTAL_")) {
    const row = await tx.rental.findUnique({
      where: { id },
      select: { scooterId: true },
    });
    if (!row) return;
    const changes = changedFields(meta.before, meta.after);
    await publishNotificationEvent(tx, {
      ...base,
      category: "rentals",
      subjectType: "rental",
      permissionKey: "rentals.read",
      scooterId: row.scooterId,
      targetPath: `/rentals/${id}`,
      changes,
    });
    return;
  }
  if (input.type.startsWith("SCOOTER_")) {
    const document =
      input.targetType === "ScooterDocument"
        ? await tx.scooterDocument.findUnique({
            where: { id },
            select: { scooterId: true },
          })
        : null;
    const scooterId = document?.scooterId ?? id;
    if (
      input.type === "SCOOTER_DOCUMENT_VISIBILITY_CHANGED" &&
      meta.before === meta.after
    )
      return;
    await publishNotificationEvent(tx, {
      ...base,
      subjectId: scooterId,
      category: "scooters",
      subjectType: "scooter",
      scooterId,
      permissionKey: document ? "scooter_documents.read" : "scooters.read",
      targetPath: `/scooters/${scooterId}`,
      changes: document ? ["documents"] : ["speed"],
    });
    return;
  }
  if (input.type.startsWith("ACCESS_")) {
    const role = input.type.startsWith("ACCESS_ROLE_");
    const before = object(meta.before),
      after = object(meta.after);
    const changes = changedFields(before, after);
    if (input.type === "ACCESS_USER_CHANGED") {
      const roleIds = (value: unknown) => stringIds(value).sort();
      const rolesChanged =
        JSON.stringify(roleIds(before.roles)) !==
        JSON.stringify(roleIds(after.roles));
      const overridesChanged =
        JSON.stringify(normalizedGrants(before.overrides, true)) !==
        JSON.stringify(normalizedGrants(after.overrides, true));
      changes.splice(
        0,
        changes.length,
        ...(rolesChanged ? ["roles"] : []),
        ...(overridesChanged ? ["permissions"] : []),
      );
      if (rolesChanged) type = "user.role.changed";
      else if (overridesChanged) type = "user.permissions.changed";
      else return;
    }
    if (input.type === "ACCESS_ROLE_CHANGED") {
      changes.splice(
        0,
        changes.length,
        ...["name", "description"].filter((key) => before[key] !== after[key]),
      );
      if (
        JSON.stringify(normalizedGrants(before.permissions)) !==
        JSON.stringify(normalizedGrants(after.permissions))
      )
        changes.push("permissions");
      if (!changes.length) return;
    }
    if (
      [
        "ACCESS_STATUS_CHANGED",
        "ACCESS_SUPER_ADMIN_CHANGED",
        "ACCESS_CUSTOMER_CHANGED",
      ].includes(input.type) &&
      !changes.length
    )
      return;
    const sourceId =
      input.targetType === "Person"
        ? ((
            await tx.person.findUnique({
              where: { id },
              select: { userId: true },
            })
          )?.userId ?? id)
        : id;
    const label = role
      ? ((await tx.role.findUnique({ where: { id }, select: { name: true } }))
          ?.name ?? "")
      : personName(
          await tx.user.findUnique({
            where: { id: sourceId },
            select: { firstName: true, lastName: true },
          }),
        );
    await publishNotificationEvent(tx, {
      ...base,
      subjectId: sourceId,
      type,
      category: "access",
      subjectType: role ? "role" : "user",
      subjectLabel: label,
      permissionKey: role ? "roles.read" : "users.read",
      targetPath: `/${role ? "roles" : "users"}/${sourceId}`,
      changes,
    });
    return;
  }
  const action = typeof meta.action === "string" ? meta.action : "";
  if (!contractBusinessActions.has(action)) return;
  const templateAction = /^(settings|branding|template|template_set)\./.test(
    action,
  );
  const retentionAction = action.startsWith("retention.");
  const pkg =
    templateAction || retentionAction
      ? null
      : await tx.documentPackage.findUnique({
          where: { id },
          select: { rentalId: true },
        });
  await publishNotificationEvent(tx, {
    ...base,
    category: "other",
    subjectType: "contract",
    subjectLabel: "",
    permissionKey: retentionAction
      ? "evidence.retention.manage"
      : templateAction
        ? "templates.read"
        : "documents.read",
    targetPath: templateAction
      ? "/company/contract-templates"
      : pkg?.rentalId
        ? `/rentals/${pkg.rentalId}`
        : null,
    changes: ["documents"],
  });
}
