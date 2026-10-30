import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { scooterInclude } from "../scooters/scooters.service";
import { toDateOnlyString } from "../common/dates/date-only";
import { v1 } from "@repo/api-shared";
import { AccessService } from "../access/access.service";
import { accessibleWhere } from "../access/access.ability";
import { AuditService } from "../audit/audit.service";
import { AuditEventType } from "../audit/audit.types";
import { Prisma } from "../generated/prisma/client";
import { assertScooterNotOnHold } from "../problems/maintenance-hold";
import { PrismaService } from "../prisma/prisma.service";
import {
  maintenanceScooterSelect,
  toMaintenanceScooter,
} from "../problems/problems.service";

export const rentalInclude = {
  scooter: { select: maintenanceScooterSelect },
  person: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      user: { select: { avatarAssetId: true } },
    },
  },
} satisfies Prisma.RentalInclude;
export type RentalRow = Prisma.RentalGetPayload<{
  include: typeof rentalInclude;
}>;

export function toRental(row: RentalRow): v1.rentals.Rental {
  return v1.rentals.rentalSchema.parse({
    id: row.id,
    personId: row.personId,
    scooterId: row.scooterId,
    person: {
      ...row.person,
      avatarAssetId: row.person.user?.avatarAssetId ?? null,
    },
    scooter: toMaintenanceScooter(row.scooter),
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status,
    customerNotes: row.customerNotes,
    internalNotes: row.internalNotes,
    revision: row.revision,
    handedOverAt: row.handedOverAt?.toISOString() ?? null,
    returnedAt: row.returnedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  });
}

@Injectable()
export class RentalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  private async requireAll(
    userId: string,
    key:
      | "rentals.read"
      | "rentals.create"
      | "rentals.handover"
      | "rentals.return"
      | "scooter_documents.write"
      | "scooter_documents.read",
    tx?: Prisma.TransactionClient,
  ) {
    const snapshot = await this.access.getSnapshot(userId, tx);
    if (
      !snapshot.isSuperAdmin &&
      !snapshot.effectiveScopes[key]?.includes("ALL")
    )
      throw new ForbiddenException("Permission required");
    return snapshot;
  }

  async list(userId: string, query: v1.rentals.ListRentalsQuery) {
    const snapshot = await this.requireAll(userId, "rentals.read");
    const where: Prisma.RentalWhereInput = {
      AND: [
        accessibleWhere(snapshot, "rentals.read", "Rental"),
        ...(query.status ? [{ status: query.status }] : []),
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.rental.findMany({
        where,
        include: rentalInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.pageSize,
        skip: (query.page - 1) * query.pageSize,
      }),
      this.prisma.rental.count({ where }),
    ]);
    return {
      items: items.map(toRental),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(userId: string, id: string) {
    const snapshot = await this.requireAll(userId, "rentals.read");
    const row = await this.prisma.rental.findFirst({
      where: {
        AND: [{ id }, accessibleWhere(snapshot, "rentals.read", "Rental")],
      },
      include: rentalInclude,
    });
    if (!row) throw new NotFoundException("Rental not found");
    return toRental(row);
  }

  private async assertDocuments(
    tx: Prisma.TransactionClient,
    scooterId: string,
    today = v1.common.dateOnlyToday(),
  ) {
    const row = await tx.scooter.findFirst({
      where: { id: scooterId, deletedAt: null },
      include: scooterInclude,
    });
    if (!row) throw new NotFoundException("Scooter not found");
    const inspections = (row.inspections ?? []).map((inspection) => ({
      inspectionDate: toDateOnlyString(inspection.inspectionDate),
      effectiveDate: toDateOnlyString(inspection.effectiveDate) ?? undefined,
      createdAt: inspection.createdAt.toISOString(),
      validUntil: toDateOnlyString(inspection.validUntil),
      result: v1.scooters.scooterItpResultSchema.parse(inspection.result),
    }));
    const itp = v1.scooters.scooterItpSummary(
      inspections,
      today,
      toDateOnlyString(row.civDocument?.issuedAt ?? null),
    );
    const documents = (row.documents ?? []).map((document) => {
      const inspection = row.inspections?.find(
        (entry) =>
          entry.cardDocumentId === document.id ||
          entry.certificateDocumentId === document.id,
      );
      return {
        ...document,
        clientCopy:
          document.clientCopyAsset && !document.clientCopyAsset.deletedAt,
        validFrom: toDateOnlyString(
          document.insurancePolicy?.validFrom ??
            inspection?.inspectionDate ??
            null,
        ),
        validUntil: toDateOnlyString(
          document.insurancePolicy?.validUntil ??
            inspection?.validUntil ??
            null,
        ),
      };
    });
    const scooter = {
      ...row,
      hasCivDocument: documents.some(v1.scooters.hasScooterCivDocumentEvidence),
      rentalInsuranceStatus: v1.scooters.rentalInsuranceStatus(
        (row.insurancePolicies ?? []).map((policy) => ({
          validFrom: toDateOnlyString(policy.validFrom),
          validUntil: toDateOnlyString(policy.validUntil),
        })),
        today,
      ),
      itpStatus: itp.status,
      temporaryRegistrationExpiresAt: toDateOnlyString(
        row.temporaryRegistrationExpiresAt ?? null,
      ),
      missingClientDocuments: v1.scooters.missingScooterClientDocuments(
        documents,
        Boolean(inspections.length) ||
          !itp.validUntil ||
          !["active", "expiring"].includes(itp.status),
        today,
      ),
    };
    const issues = v1.scooters.scooterReadinessIssues(scooter, today);
    if (issues.length)
      throw new ConflictException({
        code: "SCOOTER_DOCUMENTS_REQUIRED",
        message:
          "Valid scooter documents and their client copies are required before rental.",
        details: {
          issues,
          missingClientDocuments: scooter.missingClientDocuments,
        },
      });
  }

  async create(userId: string, input: v1.rentals.CreateRentalInput) {
    return this.prisma.$transaction(async (tx) => {
      await this.requireAll(userId, "rentals.create", tx);
      const startsAt = new Date(input.startsAt),
        endsAt = new Date(input.endsAt);
      if (endsAt <= startsAt)
        throw new ConflictException("End must be after start");
      // Every writer locks this scooter before checking reservations or handover.
      await tx.$queryRaw`SELECT id FROM "Scooter" WHERE id = ${input.scooterId} FOR UPDATE`;
      const scooter = await tx.scooter.findFirst({
        where: { id: input.scooterId, deletedAt: null },
        select: { id: true },
      });
      const person = await tx.person.findFirst({
        where: { id: input.personId, deletedAt: null },
        select: { id: true },
      });
      if (!scooter || !person)
        throw new NotFoundException("Active scooter and person are required");
      await assertScooterNotOnHold(tx, input.scooterId);
      const overlap = await tx.rental.findFirst({
        where: {
          scooterId: input.scooterId,
          OR: [
            { status: "active" },
            {
              status: "reserved",
              startsAt: { lt: endsAt },
              endsAt: { gt: startsAt },
            },
          ],
        },
        select: { id: true },
      });
      if (overlap)
        throw new ConflictException(
          "Scooter is already rented or reserved during those dates",
        );
      await this.assertDocuments(tx, input.scooterId);
      const row = await tx.rental.create({
        data: { ...input, startsAt, endsAt, createdByUserId: userId },
        include: rentalInclude,
      });
      await this.audit.recordRequired(tx, {
        type: AuditEventType.RENTAL_CREATED,
        userId,
        targetType: "Rental",
        targetId: row.id,
        meta: {
          personId: row.personId,
          scooterId: row.scooterId,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        },
      });
      return toRental(row);
    });
  }

  async transition(
    userId: string,
    id: string,
    revision: number,
    action: "handover" | "return" | "cancel",
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.requireAll(
        userId,
        action === "handover"
          ? "rentals.handover"
          : action === "return"
            ? "rentals.return"
            : "rentals.create",
        tx,
      );
      // Lock scooter first in all rental writers, then reread the rental under lock.
      const reference = await tx.rental.findUnique({
        where: { id },
        select: { scooterId: true },
      });
      if (!reference) throw new NotFoundException("Rental not found");
      await tx.$queryRaw`SELECT id FROM "Scooter" WHERE id = ${reference.scooterId} FOR UPDATE`;
      const row = await tx.rental.findUnique({
        where: { id },
        include: {
          ...rentalInclude,
          scooter: { select: { ...maintenanceScooterSelect, deletedAt: true } },
          person: {
            select: {
              id: true,
              user: { select: { avatarAssetId: true } },
              firstName: true,
              lastName: true,
              deletedAt: true,
            },
          },
        },
      });
      if (!row) throw new NotFoundException("Rental not found");
      if (row.revision !== revision)
        throw new ConflictException("Rental changed; reload before saving");
      const now = new Date();
      const expected = action === "return" ? "active" : "reserved";
      if (row.status !== expected)
        throw new ConflictException(`Rental must be ${expected}`);
      if (action === "handover") {
        await assertScooterNotOnHold(tx, row.scooterId);
        if (row.scooter.deletedAt || row.person.deletedAt)
          throw new ConflictException("Person or scooter has been archived");
        if (row.startsAt > now || row.endsAt <= now)
          throw new ConflictException(
            "Handover must occur during the reserved rental period",
          );
        if (
          await tx.rental.findFirst({
            where: {
              scooterId: row.scooterId,
              status: "active",
              id: { not: id },
            },
            select: { id: true },
          })
        )
          throw new ConflictException("Scooter already has an active rental");
      }
      if (action === "handover") await this.assertDocuments(tx, row.scooterId);
      const status =
        action === "handover"
          ? "active"
          : action === "return"
            ? "returned"
            : "cancelled";
      const updated = await tx.rental.update({
        where: { id, revision },
        data: {
          status,
          revision: { increment: 1 },
          ...(action === "handover"
            ? { handedOverAt: now }
            : action === "return"
              ? { returnedAt: now }
              : {}),
        },
        include: rentalInclude,
      });
      await this.audit.recordRequired(tx, {
        type:
          action === "handover"
            ? AuditEventType.RENTAL_HANDED_OVER
            : action === "return"
              ? AuditEventType.RENTAL_RETURNED
              : AuditEventType.RENTAL_CANCELLED,
        userId,
        targetType: "Rental",
        targetId: id,
        meta: { before: row.status, after: status, revision: updated.revision },
      });
      return toRental(updated);
    });
  }

  async documents(userId: string, scooterId: string) {
    await this.requireAll(userId, "scooter_documents.read");
    const rows = await this.prisma.scooterDocument.findMany({
      where: {
        scooterId,
        deletedAt: null,
        scooter: { deletedAt: null },
        asset: { deletedAt: null },
        type: { in: ["registration_certificate", "insurance"] },
      },
      select: { id: true, type: true, fileName: true, customerVisible: true },
      orderBy: { createdAt: "desc" },
    });
    return { items: rows };
  }

  async visibility(userId: string, id: string, customerVisible: boolean) {
    return this.prisma.$transaction(async (tx) => {
      await this.requireAll(userId, "scooter_documents.write", tx);
      await tx.$queryRaw`SELECT id FROM "ScooterDocument" WHERE id = ${id} FOR UPDATE`;
      const doc = await tx.scooterDocument.findFirst({
        where: {
          id,
          deletedAt: null,
          asset: { deletedAt: null },
          scooter: { deletedAt: null },
          type: { in: ["registration_certificate", "insurance"] },
        },
        select: { id: true, customerVisible: true },
      });
      if (!doc) throw new NotFoundException("Eligible document not found");
      await tx.scooterDocument.update({
        where: { id },
        data: { customerVisible },
      });
      await this.audit.recordRequired(tx, {
        type: AuditEventType.SCOOTER_DOCUMENT_VISIBILITY_CHANGED,
        userId,
        targetType: "ScooterDocument",
        targetId: id,
        meta: { before: doc.customerVisible, after: customerVisible },
      });
      return { id, customerVisible };
    });
  }
}
