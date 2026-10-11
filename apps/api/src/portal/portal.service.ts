import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";
import { accessibleWhere } from "../access/access.ability";
import { AccessService } from "../access/access.service";
import { Prisma } from "../generated/prisma/client";
import { ImageStorageService } from "../image-storage/image-storage.service";
import { PrismaService } from "../prisma/prisma.service";
import { toMaintenanceScooter } from "../problems/problems.service";
import { rentalInclude, type RentalRow } from "../rentals/rentals.service";

export function toCustomerRental(row: RentalRow): v1.rentals.CustomerRental {
  // Deliberate allowlist: never serialize staff notes, Person KYC, assignments, or finance data.
  return v1.rentals.customerRentalSchema.parse({
    id: row.id,
    scooterId: row.scooterId,
    scooter: toMaintenanceScooter(row.scooter),
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status,
    customerNotes: row.customerNotes,
    revision: row.revision,
    handedOverAt: row.handedOverAt?.toISOString() ?? null,
    returnedAt: row.returnedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  });
}

type PortalAction =
  | "portal.profile.read"
  | "portal.rentals.read"
  | "portal.scooter_documents.read";

@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly storage: ImageStorageService,
  ) {}

  private async gate(userId: string, key: PortalAction) {
    const snapshot = await this.access.getSnapshot(userId);
    // This is separate from grants and applies to super admins too.
    if (
      !snapshot.portalEligible ||
      (!snapshot.isSuperAdmin &&
        !snapshot.effectiveScopes[key]?.includes("OWN"))
    )
      throw new ForbiddenException("Customer access is not enabled");
    return snapshot;
  }

  private personWhere(userId: string): Prisma.PersonWhereInput {
    return {
      userId,
      deletedAt: null,
      customerAccessEnabled: true,
      user: { deletedAt: null, loginStatus: "ACTIVE" },
    };
  }

  async me(userId: string) {
    const snapshot = await this.gate(userId, "portal.profile.read");
    const person = await this.prisma.person.findFirst({
      where: {
        AND: [
          this.personWhere(userId),
          accessibleWhere(snapshot, "portal.profile.read", "Person"),
        ],
      },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!person) throw new ForbiddenException("Customer access is not enabled");
    return person;
  }

  async rentals(userId: string, query: v1.rentals.ListRentalsQuery) {
    const snapshot = await this.gate(userId, "portal.rentals.read");
    const where: Prisma.RentalWhereInput = {
      AND: [
        accessibleWhere(snapshot, "portal.rentals.read", "Rental"),
        {
          person: this.personWhere(userId),
          ...(query.status ? { status: query.status } : {}),
        },
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.rental.findMany({
        where,
        include: rentalInclude,
        orderBy: [{ startsAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.rental.count({ where }),
    ]);
    return {
      items: rows.map(toCustomerRental),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async rental(userId: string, id: string) {
    const snapshot = await this.gate(userId, "portal.rentals.read");
    const row = await this.prisma.rental.findFirst({
      where: {
        AND: [
          { id, person: this.personWhere(userId) },
          accessibleWhere(snapshot, "portal.rentals.read", "Rental"),
        ],
      },
      include: rentalInclude,
    });
    if (!row) throw new NotFoundException("Rental not found");
    return toCustomerRental(row);
  }

  private async documentWhere(
    userId: string,
    rentalId: string,
  ): Promise<Prisma.ScooterDocumentWhereInput> {
    const snapshot = await this.gate(userId, "portal.scooter_documents.read");
    const now = new Date();
    const rental = await this.prisma.rental.findFirst({
      where: {
        id: rentalId,
        person: this.personWhere(userId),
        status: "active",
        startsAt: { lte: now },
        endsAt: { gt: now },
        returnedAt: null,
        scooter: { deletedAt: null },
      },
      select: { scooterId: true },
    });
    if (!rental) throw new NotFoundException("Active rental not found");
    return {
      AND: [
        accessibleWhere(
          snapshot,
          "portal.scooter_documents.read",
          "ScooterDocument",
        ),
        {
          scooterId: rental.scooterId,
          customerVisible: true,
          deletedAt: null,
          asset: { deletedAt: null },
          type: { in: ["registration_certificate", "insurance"] },
          // Recheck the relationship in the document query, including revocation and dates.
          scooter: {
            deletedAt: null,
            rentals: {
              some: {
                id: rentalId,
                status: "active",
                startsAt: { lte: now },
                endsAt: { gt: now },
                returnedAt: null,
                person: this.personWhere(userId),
              },
            },
          },
        },
      ],
    };
  }

  async documents(userId: string, rentalId: string) {
    const where = await this.documentWhere(userId, rentalId);
    const documents = await this.prisma.scooterDocument.findMany({
      where,
      select: {
        id: true,
        type: true,
        fileName: true,
        createdAt: true,
        asset: { select: { contentType: true, byteSize: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return {
      items: documents.map((document) =>
        v1.rentals.customerDocumentSchema.parse({
          id: document.id,
          type: document.type,
          fileName: document.fileName,
          createdAt: document.createdAt.toISOString(),
          contentType: document.asset.contentType,
          byteSize: document.asset.byteSize,
        }),
      ),
    };
  }

  async content(userId: string, rentalId: string, documentId: string) {
    const where = await this.documentWhere(userId, rentalId);
    const document = await this.prisma.scooterDocument.findFirst({
      where: { AND: [{ id: documentId }, where] },
      select: { asset: { select: { storageKey: true, contentType: true } } },
    });
    if (!document) throw new NotFoundException("Document not found");
    return {
      ...(await this.storage.readDocument(document.asset.storageKey)),
      contentType: document.asset.contentType,
    };
  }
}
