import {
  BadRequestException,
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
  prefillRentalInspection,
  inspectionScooterChanges,
  inspectionHasCriticalFinding,
} from "./rental-inspection";
import { assertPackageCurrent } from "../contract-templates/package-integrity";
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
    workflowVersion: row.workflowVersion,
    conclusionContext: row.conclusionContext,
    terms: row.termsSnapshot
      ? v1.rentals.rentalTermsSchema.parse(row.termsSnapshot)
      : null,
    agreementStartsAt: row.agreementStartsAt?.toISOString() ?? null,
    agreementEndsAt: row.agreementEndsAt?.toISOString() ?? null,
    billingAnchorAt: row.billingAnchorAt?.toISOString() ?? null,
    nextPaymentDueAt: row.nextPaymentDueAt?.toISOString() ?? null,
    contractTimezone: row.contractTimezone,
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
    today = v1.rentals.rentalDateOnly(new Date()),
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
          document.customerVisible === true &&
          document.clientCopyAsset &&
          !document.clientCopyAsset.deletedAt,
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

  private async assertNewCustomerPromotion(
    db: Prisma.TransactionClient,
    personId: string | undefined,
    promotion: v1.rentals.RentalTerms["promotion"] | undefined,
  ) {
    if (promotion !== "three_plus_one") return;
    if (
      !personId ||
      (await db.rental.findFirst({
        where: { personId },
        select: { id: true },
      }))
    )
      throw new ConflictException({
        code: v1.rentals.NEW_CUSTOMER_PROMOTION_ERROR_CODE,
        message:
          "The 3+1 offer is available only to new customers with no rental history. Select the standard plan.",
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
      // Serialize every creation for this customer, including standard rentals,
      // so concurrent requests cannot both consume the new-customer offer.
      await tx.$queryRaw`SELECT id FROM "Person" WHERE id = ${input.personId} FOR UPDATE`;
      const scooter = await tx.scooter.findFirst({
        where: { id: input.scooterId, deletedAt: null },
        select: { id: true, requiredLicenseCategory: true },
      });
      const person = await tx.person.findFirst({
        where: { id: input.personId, deletedAt: null },
        select: { id: true },
      });
      if (!scooter || !person)
        throw new NotFoundException("Active scooter and person are required");
      await this.assertNewCustomerPromotion(
        tx,
        input.personId,
        input.promotion,
      );
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
      await this.assertDocuments(
        tx,
        input.scooterId,
        v1.rentals.rentalDateOnly(startsAt),
      );
      const terms = v1.rentals.calculateRentalTerms(
        v1.scooters.scooterCommercialCategoryForLicense(
          scooter.requiredLicenseCategory,
        ),
        input.promotion,
        input.rentalPaymentMethod,
        input.depositPaymentMethod,
      );
      const agreementStartsAt = new Date(
        input.agreementStartsAt ?? input.startsAt,
      );
      if (agreementStartsAt < startsAt || agreementStartsAt >= endsAt)
        throw new BadRequestException(
          "Agreement must begin during the reservation interval",
        );
      const driverPersonIds = [
        ...new Set(input.driverPersonIds ?? [input.personId]),
      ];
      if (
        (await tx.person.count({
          where: { id: { in: driverPersonIds }, deletedAt: null },
        })) !== driverPersonIds.length
      )
        throw new NotFoundException("Active drivers are required");
      const row = await tx.rental.create({
        data: {
          personId: input.personId,
          scooterId: input.scooterId,
          customerNotes: input.customerNotes,
          internalNotes: input.internalNotes,
          startsAt,
          endsAt,
          createdByUserId: userId,
          workflowVersion: 1,
          conclusionContext: input.conclusionContext,
          termsSnapshot: terms,
          agreementStartsAt,
          agreementEndsAt: v1.rentals.addRentalCalendar(
            agreementStartsAt,
            0,
            terms.agreementMonths,
          ),
          billingAnchorAt: agreementStartsAt,
          nextPaymentDueAt: v1.rentals.addRentalCalendar(
            agreementStartsAt,
            terms.initialCoverageDays,
          ),
          contractTimezone: terms.timezone,
          participants: {
            create: [
              { personId: input.personId, role: "lessee" },
              ...driverPersonIds.map((personId) => ({
                personId,
                role: "driver",
              })),
            ],
          },
        },
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
    handover?: { recipientPersonId: string; originalIdentityChecked: true },
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
      await tx.$queryRaw`SELECT id FROM "Rental" WHERE id = ${id} FOR UPDATE`;
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
      if (action === "return" && row.workflowVersion === 1) {
        const inspection = await tx.rentalInspection.findFirst({
          where: { rentalId: id, eventType: "return", status: "confirmed" },
          orderBy: { version: "desc" },
        });
        if (!inspection)
          throw new ConflictException(
            "Confirm the return inspection before recording the return",
          );
      }
      if (action === "handover") {
        await this.assertDocuments(tx, row.scooterId);
        const issues = await this.checkoutIssues(tx, id);
        if (issues.length)
          throw new ConflictException({
            code: "RENTAL_NOT_READY",
            message: "Complete the rental checkout before handover",
            details: { issues },
          });
        if (
          !handover?.originalIdentityChecked ||
          !(await tx.rentalParticipant.findFirst({
            where: {
              rentalId: id,
              personId: handover.recipientPersonId,
              role: "driver",
            },
            select: { id: true },
          }))
        )
          throw new ConflictException(
            "Check the original identity document of the authorized driver receiving the scooter",
          );
      }
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
            ? {
                handedOverAt: now,
                handoverRecipientPersonId: handover!.recipientPersonId,
                handoverConfirmedByUserId: userId,
                handoverOriginalIdentityCheckedAt: now,
              }
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
        meta: {
          before: row.status,
          after: status,
          revision: updated.revision,
          ...(action === "handover"
            ? {
                recipientPersonId: handover!.recipientPersonId,
                originalIdentityCheckedAt: now.toISOString(),
              }
            : {}),
        },
      });
      return toRental(updated);
    });
  }

  async quote(
    userId: string,
    input: {
      scooterId: string;
      personId?: string;
      promotion?: v1.rentals.RentalTerms["promotion"];
      rentalPaymentMethod?: v1.rentals.RentalTerms["rentalPaymentMethod"];
      depositPaymentMethod?: v1.rentals.RentalTerms["depositPaymentMethod"];
    },
  ) {
    await this.requireAll(userId, "rentals.create");
    const scooter = await this.prisma.scooter.findFirst({
      where: { id: input.scooterId, deletedAt: null },
      select: { requiredLicenseCategory: true },
    });
    if (!scooter) throw new NotFoundException("Scooter not found");
    if (input.personId) {
      const person = await this.prisma.person.findFirst({
        where: { id: input.personId, deletedAt: null },
        select: { id: true },
      });
      if (!person) throw new NotFoundException("Person not found");
    }
    await this.assertNewCustomerPromotion(
      this.prisma,
      input.personId,
      input.promotion,
    );
    return v1.rentals.calculateRentalTerms(
      v1.scooters.scooterCommercialCategoryForLicense(
        scooter.requiredLicenseCategory,
      ),
      input.promotion,
      input.rentalPaymentMethod,
      input.depositPaymentMethod,
    );
  }

  async setContext(
    userId: string,
    id: string,
    input: {
      revision: number;
      conclusionContext: v1.rentals.RentalConclusionContext;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.requireAll(userId, "rentals.create", tx);
      const reference = await tx.rental.findUniqueOrThrow({
        where: { id },
        select: { scooterId: true },
      });
      await tx.$queryRaw`SELECT id FROM "Scooter" WHERE id = ${reference.scooterId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "Rental" WHERE id = ${id} FOR UPDATE`;
      const rental = await tx.rental.findUniqueOrThrow({ where: { id } });
      if (rental.revision !== input.revision || rental.status !== "reserved")
        throw new ConflictException(
          "Rental changed; reload before updating its conclusion context",
        );
      if (
        await tx.documentPackage.findFirst({
          where: { rentalId: id, contractConcludedAt: { not: null } },
          select: { id: true },
        })
      )
        throw new ConflictException(
          "A concluded agreement requires the correction/addendum procedure",
        );
      if (rental.conclusionContext === input.conclusionContext)
        return toRental(
          await tx.rental.findUniqueOrThrow({
            where: { id },
            include: rentalInclude,
          }),
        );
      const updated = await tx.rental.update({
        where: { id, revision: input.revision },
        data: {
          conclusionContext: input.conclusionContext,
          revision: { increment: 1 },
        },
        include: rentalInclude,
      });
      await this.audit.recordRequired(tx, {
        type: AuditEventType.RENTAL_DRAFT_SAVED,
        userId,
        targetType: "Rental",
        targetId: id,
        meta: {
          action: "conclusion_context_changed",
          before: rental.conclusionContext,
          after: input.conclusionContext ?? null,
        },
      });
      return toRental(updated);
    });
  }

  async checkout(userId: string, id: string) {
    await this.requireAll(userId, "rentals.read");
    const rental = await this.get(userId, id);
    const scooter = await this.prisma.scooter.findUniqueOrThrow({
      where: { id: rental.scooterId },
    });
    const [inspection, payments, draft, drivers] = await Promise.all([
      this.prisma.rentalInspection.findFirst({
        where: {
          rentalId: id,
          status: "confirmed",
          eventType: rental.status === "active" ? "return" : "handover",
        },
        orderBy: { version: "desc" },
      }),
      this.prisma.rentalPayment.findMany({
        where: { rentalId: id },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.rentalInspection.findFirst({
        where: {
          rentalId: id,
          status: "draft",
          eventType: rental.status === "active" ? "return" : "handover",
        },
        orderBy: { version: "desc" },
      }),
      this.prisma.rentalParticipant.findMany({
        where: { rentalId: id, role: "driver" },
        include: { person: { select: { firstName: true, lastName: true } } },
      }),
    ]);
    const usableDraft =
      draft && draft.scooterUpdatedAt.getTime() === scooter.updatedAt.getTime()
        ? draft
        : null;
    return {
      rental,
      inspection,
      payments,
      expectedScooterUpdatedAt: scooter.updatedAt.toISOString(),
      lastKnownMileageKm: scooter.currentMileageKm,
      handoverRecipients: drivers.map((driver) => ({
        personId: driver.personId,
        ...driver.person,
      })),
      prefill: usableDraft
        ? v1.rentals.rentalInspectionDataSchema.parse(usableDraft.dataSnapshot)
        : inspection
          ? v1.rentals.rentalInspectionDataSchema.parse(inspection.dataSnapshot)
          : prefillRentalInspection(scooter),
      issues: await this.checkoutIssues(this.prisma, id),
    };
  }

  async readiness(userId: string, id: string) {
    await this.requireAll(userId, "rentals.read");
    const issues = await this.checkoutIssues(this.prisma, id);
    return { ready: issues.length === 0, issues };
  }

  /** Evaluate independent readiness states; a signature or selected method never implies receipt. */
  private async checkoutIssues(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<string[]> {
    const rental = await tx.rental.findUnique({
      where: { id },
      include: {
        scooter: true,
        person: true,
        participants: {
          include: {
            person: { include: { documents: { where: { deletedAt: null } } } },
          },
        },
        payments: true,
      },
    });
    if (!rental) throw new NotFoundException("Rental not found");
    if (rental.workflowVersion !== 1 || !rental.termsSnapshot)
      return ["checkout.legacyRequiresReview"];
    const terms = v1.rentals.rentalTermsSchema.parse(rental.termsSnapshot);
    const issues: string[] = [];
    const lesseeBirthDate = rental.person.dateOfBirth
      ?.toISOString()
      .slice(0, 10);
    if (
      !v1.rentals.rentalAdultPolicyEligible(
        lesseeBirthDate,
        rental.agreementStartsAt ?? rental.startsAt,
      ) ||
      !v1.rentals.rentalAdultPolicyEligible(lesseeBirthDate, new Date())
    )
      issues.push("lessee.approvedRepresentationRequired");
    if (!rental.conclusionContext) issues.push("contract.conclusionContext");
    if (rental.status !== "reserved") issues.push("rental.notReserved");
    const inspection = await tx.rentalInspection.findFirst({
      where: { rentalId: id, eventType: "handover", status: "confirmed" },
      orderBy: { version: "desc" },
    });
    if (!inspection) issues.push("inspection.required");
    else {
      if (
        inspection.scooterUpdatedAt.getTime() !==
        rental.scooter.updatedAt.getTime()
      )
        issues.push("inspection.scooterChanged");
      if (
        inspection.confirmedAt &&
        (await tx.scooterProblem.findFirst({
          where: {
            scooterId: rental.scooterId,
            updatedAt: { gt: inspection.confirmedAt },
            OR: [{ blocksUsage: true }, { holdClearedAt: { not: null } }],
          },
          select: { id: true },
        }))
      )
        issues.push("inspection.technicalHistoryChanged");
      issues.push(
        ...v1.rentals.inspectionReadinessIssues(
          v1.rentals.rentalInspectionDataSchema.parse(inspection.dataSnapshot),
          v1.scooters.licenceSpeedLimitKmh(
            rental.scooter.requiredLicenseCategory,
          ),
        ),
      );
    }
    const packageRow = await tx.documentPackage.findFirst({
      where: {
        rentalId: id,
        status: "signed",
        rentalRevision: rental.revision,
        inspectionId: inspection?.id ?? "missing",
        companyAcceptedAt: { not: null },
        customerCompletedAt: { not: null },
        identityApprovedAt: { not: null },
        phoneVerifiedAt: { not: null },
      },
      orderBy: { revision: "desc" },
    });
    if (!packageRow) issues.push("documents.signedPackageRequired");
    else {
      if (!packageRow.manifestHash || !packageRow.contractConcludedAt)
        issues.push("documents.evidenceIncomplete");
      try {
        await assertPackageCurrent(tx, packageRow);
      } catch (error) {
        if (error instanceof ConflictException)
          issues.push("documents.sourceChanged");
        else throw error;
      }
    }
    for (const purpose of ["rent", "deposit"] as const) {
      const amount = rental.payments
        .filter((p) => p.purpose === purpose && p.status === "confirmed")
        .reduce((sum, p) => sum + p.amountMinor, 0);
      if (
        amount <
        (purpose === "rent" ? terms.initialRentMinor : terms.depositMinor)
      )
        issues.push(`payments.${purpose}`);
    }
    const drivers = rental.participants.filter((p) => p.role === "driver");
    if (!drivers.length) issues.push("drivers.required");
    const today = v1.rentals.rentalDateOnly(new Date());
    const planned = v1.rentals.rentalDateOnly(
      rental.agreementStartsAt ?? rental.startsAt,
    );
    for (const driver of drivers) {
      const person = driver.person;
      const birthDate = person.dateOfBirth?.toISOString().slice(0, 10);
      if (
        person.deletedAt ||
        !v1.rentals.rentalAdultPolicyEligible(birthDate, new Date()) ||
        !v1.rentals.rentalAdultPolicyEligible(
          birthDate,
          rental.agreementStartsAt ?? rental.startsAt,
        )
      )
        issues.push(`drivers.${person.id}.approvedAdultPolicyRequired`);
      const identity = person.documents.find(
        (d) =>
          ["nationalId", "passport", "other"].includes(d.type) &&
          d.status === "verified" &&
          d.expiresOn &&
          d.expiresOn.toISOString().slice(0, 10) >= today &&
          d.expiresOn.toISOString().slice(0, 10) >= planned,
      );
      if (!identity) issues.push(`drivers.${person.id}.identity`);
      if (rental.scooter.requiredLicenseCategory !== "none") {
        const permitted = person.documents.some((d) => {
          if (
            d.type !== "driverLicense" ||
            d.status !== "verified" ||
            !d.expiresOn ||
            d.expiresOn.toISOString().slice(0, 10) < today ||
            d.expiresOn.toISOString().slice(0, 10) < planned
          )
            return false;
          const categories =
            v1.persons.personDriverLicenseCategoriesSchema.safeParse(
              d.licenseCategories,
            );
          return (
            categories.success &&
            categories.data.some(
              (c) =>
                c.category === rental.scooter.requiredLicenseCategory &&
                !c.restrictions &&
                c.issuedOn &&
                c.issuedOn <= today &&
                c.issuedOn <= planned &&
                c.expiresOn &&
                c.expiresOn >= today &&
                c.expiresOn >= planned,
            )
          );
        });
        if (!permitted) issues.push(`drivers.${person.id}.licence`);
      }
    }
    if (
      await tx.scooterProblem.findFirst({
        where: {
          scooterId: rental.scooterId,
          blocksUsage: true,
          status: { in: ["open", "in_progress"] },
        },
        select: { id: true },
      })
    )
      issues.push("scooter.maintenanceHold");
    try {
      await this.assertDocuments(tx, rental.scooterId);
    } catch (error) {
      if (error instanceof ConflictException) issues.push("scooter.documents");
      else throw error;
    }
    return [...new Set(issues)];
  }

  async saveInspection(
    userId: string,
    id: string,
    input: v1.rentals.SaveRentalInspectionInput,
    confirm: boolean,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.requireAll(
        userId,
        input.eventType === "return" ? "rentals.return" : "rentals.handover",
        tx,
      );
      const reference = await tx.rental.findUnique({
        where: { id },
        select: { scooterId: true },
      });
      if (!reference) throw new NotFoundException("Rental not found");
      await tx.$queryRaw`SELECT id FROM "Scooter" WHERE id = ${reference.scooterId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "Rental" WHERE id = ${id} FOR UPDATE`;
      const rental = await tx.rental.findUniqueOrThrow({
        where: { id },
        include: { scooter: true },
      });
      const applicationSpeedLimitKmh = v1.scooters.licenceSpeedLimitKmh(
        rental.scooter.requiredLicenseCategory,
      );
      if (
        rental.revision !== input.revision ||
        rental.scooter.updatedAt.getTime() !==
          new Date(input.expectedScooterUpdatedAt).getTime()
      )
        throw new ConflictException({
          code: "SCOOTER_UPDATE_CONFLICT",
          message: "Rental or scooter changed; reload before saving inspection",
        });
      if (
        rental.status !== (input.eventType === "return" ? "active" : "reserved")
      )
        throw new ConflictException(
          "Inspection event does not match rental state",
        );
      if (
        input.data.mediaIds.length &&
        (await tx.scooterPhoto.count({
          where: {
            id: { in: input.data.mediaIds },
            rentalId: id,
            scooterId: rental.scooterId,
            type:
              input.eventType === "handover" ? "RENTAL_BEFORE" : "RENTAL_AFTER",
            deletedAt: null,
            asset: { deletedAt: null },
          },
        })) !== new Set(input.data.mediaIds).size
      )
        throw new BadRequestException(
          "Inspection media must belong to this rental and scooter",
        );
      const latest = await tx.rentalInspection.findFirst({
        where: { rentalId: id },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      let scooterUpdatedAt = rental.scooter.updatedAt;
      if (confirm) {
        const changes = inspectionScooterChanges(input.data);
        if (
          changes.currentMileageKm != null &&
          rental.scooter.currentMileageKm !== null &&
          changes.currentMileageKm < rental.scooter.currentMileageKm
        )
          throw new ConflictException(
            "Mileage cannot decrease; record instrument history before correction",
          );
        const effective = Object.fromEntries(
          Object.entries(changes).filter(
            ([key, value]) =>
              value !== undefined &&
              value !== rental.scooter[key as keyof typeof changes],
          ),
        );
        if (Object.keys(effective).length) {
          const updated = await tx.scooter.update({
            where: { id: rental.scooterId },
            data: { ...effective, updatedAt: new Date() },
          });
          scooterUpdatedAt = updated.updatedAt;
        }
        if (
          inspectionHasCriticalFinding(input.data) ||
          (applicationSpeedLimitKmh !== null &&
            input.data.observedSpeedKmh != null &&
            input.data.observedSpeedKmh > applicationSpeedLimitKmh)
        ) {
          await tx.scooterProblem.create({
            data: {
              scooterId: rental.scooterId,
              title: "Rental inspection: technical defect",
              description:
                input.data.criticalDefect ??
                "A critical control failed during rental inspection",
              blocksUsage: true,
              reporterId: userId,
              status: "open",
            },
          });
          await this.audit.recordRequired(tx, {
            type: AuditEventType.PROBLEM_CREATED,
            userId,
            targetType: "Scooter",
            targetId: rental.scooterId,
            meta: { rentalId: id, source: "rental_inspection" },
          });
        }
        await tx.rental.update({
          where: { id, revision: input.revision },
          data: { revision: { increment: 1 } },
        });
      }
      const row = await tx.rentalInspection.create({
        data: {
          rentalId: id,
          scooterId: rental.scooterId,
          eventType: input.eventType,
          version: (latest?.version ?? 0) + 1,
          status: confirm ? "confirmed" : "draft",
          dataSnapshot: input.data,
          scooterUpdatedAt,
          inspectedByUserId: userId,
          confirmedAt: confirm ? new Date() : null,
        },
      });
      await this.audit.recordRequired(tx, {
        type: confirm
          ? AuditEventType.RENTAL_INSPECTION_CONFIRMED
          : AuditEventType.RENTAL_INSPECTION_SAVED,
        userId,
        targetType: "Rental",
        targetId: id,
        meta: {
          inspectionId: row.id,
          version: row.version,
          eventType: input.eventType,
          scooterBefore: rental.scooter.updatedAt.toISOString(),
          scooterAfter: scooterUpdatedAt.toISOString(),
          changes: confirm ? inspectionScooterChanges(input.data) : {},
        },
      });
      return {
        inspection: row,
        revision: input.revision + (confirm ? 1 : 0),
        issues: v1.rentals.inspectionReadinessIssues(
          input.data,
          applicationSpeedLimitKmh,
        ),
      };
    });
  }

  /** Receipt confirmation allocates to the original due period; receipt time never shifts its anchor. */
  async confirmPayment(
    userId: string,
    id: string,
    input: v1.rentals.RentalPaymentInput,
  ) {
    if (new Date(input.receivedAt).getTime() > Date.now())
      throw new BadRequestException(
        "A receipt cannot be confirmed in the future",
      );
    return this.prisma.$transaction(async (tx) => {
      await this.requireAll(userId, "rentals.handover", tx);
      await tx.$queryRaw`SELECT id FROM "Rental" WHERE id = ${id} FOR UPDATE`;
      const rental = await tx.rental.findUnique({
        where: { id },
        include: { payments: true },
      });
      if (!rental || !rental.termsSnapshot || !rental.billingAnchorAt)
        throw new NotFoundException("Rental checkout not found");
      if (!["reserved", "active"].includes(rental.status))
        throw new ConflictException("Rental no longer accepts receipts");
      const existing = await tx.rentalPayment.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        if (
          existing.rentalId !== id ||
          existing.purpose !== input.purpose ||
          existing.amountMinor !== input.amountMinor ||
          existing.method !== input.method ||
          existing.evidenceReference !== input.evidenceReference ||
          existing.receivedAt.getTime() !== new Date(input.receivedAt).getTime()
        )
          throw new ConflictException(
            "Idempotency key already used for a different receipt",
          );
        return existing;
      }
      const terms = v1.rentals.rentalTermsSchema.parse(rental.termsSnapshot);
      const confirmed = rental.payments.filter(
        (p) => p.status === "confirmed" && p.purpose === input.purpose,
      );
      if (input.purpose === "deposit" && confirmed.length)
        throw new ConflictException("Deposit is already confirmed");
      if (
        input.purpose === "rent" &&
        confirmed.length &&
        rental.status === "reserved"
      )
        throw new ConflictException("Initial rent is already confirmed");
      const expectedAmount =
        input.purpose === "deposit"
          ? terms.depositMinor
          : confirmed.length
            ? terms.weeklyRateMinor
            : terms.initialRentMinor;
      if (input.amountMinor !== expectedAmount)
        throw new ConflictException({
          code: "RENTAL_RECEIPT_AMOUNT_MISMATCH",
          message: "Receipt must match the server-calculated obligation",
          details: { expectedAmountMinor: expectedAmount },
        });
      const coverageStartsAt =
        input.purpose === "rent"
          ? confirmed.reduce(
              (date, p) =>
                p.coverageEndsAt && p.coverageEndsAt > date
                  ? p.coverageEndsAt
                  : date,
              rental.billingAnchorAt,
            )
          : null;
      const coverageEndsAt = coverageStartsAt
        ? v1.rentals.addRentalCalendar(
            coverageStartsAt,
            confirmed.length ? 7 : terms.initialCoverageDays,
          )
        : null;
      const payment = await tx.rentalPayment.create({
        data: {
          ...input,
          rentalId: id,
          receivedAt: new Date(input.receivedAt),
          confirmedByUserId: userId,
          coverageStartsAt,
          coverageEndsAt,
        },
      });
      if (coverageEndsAt)
        await tx.rental.update({
          where: { id },
          data: { nextPaymentDueAt: coverageEndsAt },
        });
      await this.audit.recordRequired(tx, {
        type: AuditEventType.RENTAL_PAYMENT_CONFIRMED,
        userId,
        targetType: "Rental",
        targetId: id,
        meta: {
          paymentId: payment.id,
          purpose: input.purpose,
          amountMinor: input.amountMinor,
          method: input.method,
          coverageStartsAt: coverageStartsAt?.toISOString() ?? null,
          coverageEndsAt: coverageEndsAt?.toISOString() ?? null,
        },
      });
      return payment;
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
