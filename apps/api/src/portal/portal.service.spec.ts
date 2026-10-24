import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { AccessService } from "../access/access.service";
import type { AccessSnapshot } from "../access/access.resolver";
import type { PrismaService } from "../prisma/prisma.service";
import type { ImageStorageService } from "../image-storage/image-storage.service";
import type { RentalRow } from "../rentals/rentals.service";
import { PortalService, toCustomerRental } from "./portal.service";

const snapshot: AccessSnapshot = {
  userId: "customer-a",
  isSuperAdmin: false,
  portalEligible: true,
  accessRevision: 1,
  roleVersions: [],
  effectiveScopes: {
    "portal.rentals.read": ["OWN"],
    "portal.scooter_documents.read": ["OWN"],
  },
};

describe("Customer portal boundaries", () => {
  const db = {
    rental: { findFirst: jest.fn() },
    scooterDocument: { findFirst: jest.fn(), findMany: jest.fn() },
  };
  const access = { getSnapshot: jest.fn() },
    storage = { readDocument: jest.fn() };
  const service = new PortalService(
    db as unknown as PrismaService,
    access as unknown as AccessService,
    storage as unknown as ImageStorageService,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    access.getSnapshot.mockResolvedValue(snapshot);
  });

  it("customer eligibility revocation wins even over super-admin grants", async () => {
    access.getSnapshot.mockResolvedValue({
      ...snapshot,
      isSuperAdmin: true,
      portalEligible: false,
    });
    await expect(service.rental("customer-a", "rental")).rejects.toThrow(
      ForbiddenException,
    );
    expect(db.rental.findFirst).not.toHaveBeenCalled();
  });

  it("direct rental IDs retain own-person and active-account filtering", async () => {
    db.rental.findFirst.mockResolvedValue(null);
    await expect(service.rental("customer-a", "rental-b")).rejects.toThrow(
      NotFoundException,
    );
    const filter = JSON.stringify(db.rental.findFirst.mock.calls[0]);
    expect(filter).toContain('"userId":"customer-a"');
    expect(filter).toContain('"customerAccessEnabled":true');
    expect(filter).toContain('"loginStatus":"ACTIVE"');
  });

  it("expired/returned/foreign rentals cannot fetch even approved scooter bytes", async () => {
    db.rental.findFirst.mockResolvedValue(null);
    await expect(
      service.content("customer-a", "rental-b", "doc"),
    ).rejects.toThrow(NotFoundException);
    expect(db.rental.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "active",
          startsAt: { lte: expect.any(Date) as Date },
          endsAt: { gt: expect.any(Date) as Date },
          returnedAt: null,
        }) as unknown,
      }),
    );
    expect(storage.readDocument).not.toHaveBeenCalled();
  });

  it("document download checks publication, type, scooter and rental relationships", async () => {
    db.rental.findFirst.mockResolvedValue({ scooterId: "scooter" });
    db.scooterDocument.findFirst.mockResolvedValue(null);
    await expect(
      service.content("customer-a", "rental-a", "foreign-doc"),
    ).rejects.toThrow(NotFoundException);
    const filter = JSON.stringify(db.scooterDocument.findFirst.mock.calls[0]);
    for (const value of [
      '"customerVisible":true',
      '"scooterId":"scooter"',
      '"id":"rental-a"',
      '"userId":"customer-a"',
      "registration_certificate",
      "insurance",
    ])
      expect(filter).toContain(value);
    expect(storage.readDocument).not.toHaveBeenCalled();
  });

  it("serves the branded copy to customers when available, with original fallback", async () => {
    db.rental.findFirst.mockResolvedValue({ scooterId: "scooter" });
    const original = {
      storageKey: "original.pdf",
      contentType: "application/pdf",
    };
    const copy = {
      storageKey: "branded.png",
      contentType: "image/png",
      deletedAt: null,
    };
    db.scooterDocument.findFirst.mockResolvedValue({
      asset: original,
      clientCopyAsset: copy,
    });
    storage.readDocument.mockResolvedValue({
      body: "fixture",
      contentLength: 100,
    });
    expect(
      (await service.content("customer-a", "rental", "document")).contentType,
    ).toBe("image/png");
    expect(storage.readDocument).toHaveBeenLastCalledWith("branded.png");
    db.scooterDocument.findFirst.mockResolvedValue({
      asset: original,
      clientCopyAsset: null,
    });
    await service.content("customer-a", "rental", "document");
    expect(storage.readDocument).toHaveBeenLastCalledWith("original.pdf");
  });

  it("lists the same branded file that customer download delivers", async () => {
    db.rental.findFirst.mockResolvedValue({ scooterId: "scooter" });
    db.scooterDocument.findMany.mockResolvedValue([
      {
        id: "doc",
        type: "registration_certificate",
        fileName: "original.pdf",
        createdAt: new Date(),
        asset: { contentType: "application/pdf", byteSize: 100 },
        clientCopyFileName: "branded.png",
        clientCopyAsset: {
          contentType: "image/png",
          byteSize: 200,
          deletedAt: null,
        },
      },
    ]);
    const result = await service.documents("customer-a", "rental");
    expect(result.items[0]).toMatchObject({
      fileName: "branded.png",
      contentType: "image/png",
      byteSize: 200,
    });
  });

  it("customer DTO excludes internal Person and rental data", () => {
    const now = new Date();
    const row = {
      id: "rental",
      scooterId: "scooter",
      personId: "person",
      person: { id: "person", firstName: "First", lastName: "Last" },
      startsAt: now,
      endsAt: now,
      createdAt: now,
      status: "returned",
      customerNotes: "Return with keys",
      internalNotes: "Internal only",
      revision: 1,
      handedOverAt: now,
      returnedAt: now,
      scooter: {
        id: "scooter",
        fleetNumber: 1,
        model: null,
        brand: { name: "Brand", code: "BRD" },
        registrationNumber: null,
      },
    } as RentalRow;
    const result = toCustomerRental(row);
    expect(result.customerNotes).toBe("Return with keys");
    expect(result.scooter.brandCode).toBe("BRD");
    expect(result).not.toHaveProperty("internalNotes");
    expect(result).not.toHaveProperty("person");
    expect(result).not.toHaveProperty("personId");
  });
});
