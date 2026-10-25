import { v1 } from "@repo/api-shared";
import { ScooterItpService } from "./scooter-itp.service";
import type { PrismaService } from "../prisma/prisma.service";

const vin = "LXYTCKP05P0000001";
const input: v1.scooters.ScooterItpInput = {
  inspectionDate: "2026-01-01",
  validUntil: "2027-01-01",
  result: "passed",
  certificateNumber: "CERT-1",
  odometerKm: 0,
  cardDocumentId: "card",
  certificateDocumentId: "certificate",
  evidenceReviewed: true,
};
const evidence = (
  id: string,
  type: "itp_card" | "itp_certificate",
  documentVin = vin,
) => ({
  id,
  type,
  extractedData: { vin: documentVin, fields: {}, rawFields: {} },
});
describe("inspection evidence confirmation", () => {
  const tx = {
    $queryRaw: jest.fn(),
    scooter: { findUniqueOrThrow: jest.fn() },
    scooterDocument: { findMany: jest.fn() },
    scooterItpInspection: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const service = new ScooterItpService(prisma as unknown as PrismaService);
  beforeEach(() => {
    jest.clearAllMocks();
    tx.$queryRaw.mockResolvedValue([{ id: "scooter" }]);
    tx.scooter.findUniqueOrThrow.mockResolvedValue({ vin });
    tx.scooterDocument.findMany.mockResolvedValue([
      evidence("card", "itp_card"),
      evidence("certificate", "itp_certificate"),
    ]);
    tx.scooterItpInspection.findUnique.mockResolvedValue(null);
    tx.scooterItpInspection.findFirst.mockResolvedValue(null);
    tx.scooterItpInspection.create.mockImplementation(
      ({ data }: { data: object }) =>
        Promise.resolve({
          ...data,
          id: "inspection",
          createdAt: new Date("2026-01-01"),
          updatedAt: new Date("2026-01-01"),
        }),
    );
  });
  it("records reviewed paired evidence without replacing inspection history", async () => {
    const record = await service.create("scooter", input);
    expect(record.validUntil).toBe("2027-01-01");
    expect(record.odometerKm).toBe(0);
    expect(tx.scooterItpInspection.create).toHaveBeenCalledTimes(1);
  });
  it("rejects missing or foreign-scooter evidence", async () => {
    tx.scooterDocument.findMany.mockResolvedValue([
      evidence("card", "itp_card"),
    ]);
    await expect(service.create("scooter", input)).rejects.toThrow(
      "Both inspection documents",
    );
    expect(tx.scooterItpInspection.create).not.toHaveBeenCalled();
  });
  it("rejects a readable conflicting VIN even after review confirmation", async () => {
    tx.scooterDocument.findMany.mockResolvedValue([
      evidence("card", "itp_card"),
      evidence("certificate", "itp_certificate", "LXYTCKP05P0000002"),
    ]);
    await expect(service.create("scooter", input)).rejects.toThrow(
      "VIN does not match",
    );
    expect(tx.scooterItpInspection.create).not.toHaveBeenCalled();
  });
  it("rejects malformed stored analysis instead of accepting its type hint", async () => {
    tx.scooterDocument.findMany.mockResolvedValue([
      { id: "card", type: "itp_card", extractedData: { vin: "INVALID" } },
      evidence("certificate", "itp_certificate"),
    ]);
    await expect(service.create("scooter", input)).rejects.toThrow(
      "reviewed again",
    );
    expect(tx.scooterItpInspection.create).not.toHaveBeenCalled();
  });
  it("does not treat a certificate-only logical document as a yellow card based on its upload hint", async () => {
    tx.scooterDocument.findMany.mockResolvedValue([
      {
        id: "bundle",
        type: "itp_card",
        extractedData: {
          vin,
          fields: {},
          rawFields: {},
          documents: [
            {
              id: "certificate",
              documentType: "itp_certificate",
              pages: [1],
              vin,
              fields: {},
              rawFields: {},
            },
          ],
        },
      },
    ]);
    await expect(
      service.create("scooter", {
        ...input,
        cardDocumentId: "bundle",
        certificateDocumentId: "bundle",
      }),
    ).rejects.toThrow("updated yellow card");
    expect(tx.scooterItpInspection.create).not.toHaveBeenCalled();
  });
  it("deduplicates the same certificate inspection after both scans are reuploaded", async () => {
    tx.scooterDocument.findMany.mockResolvedValue([
      evidence("new-card", "itp_card"),
      evidence("new-certificate", "itp_certificate"),
    ]);
    tx.scooterItpInspection.findFirst.mockResolvedValue({
      ...input,
      id: "existing",
      inspectionDate: new Date("2026-01-01"),
      validUntil: new Date("2027-01-01"),
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    });
    await expect(
      service.create("scooter", {
        ...input,
        cardDocumentId: "new-card",
        certificateDocumentId: "new-certificate",
      }),
    ).resolves.toMatchObject({ id: "existing", cardDocumentId: "card" });
    expect(tx.scooterItpInspection.create).not.toHaveBeenCalled();
  });
  it("accepts both document types from one mixed original without duplicating the upload", async () => {
    const document = {
      id: "bundle",
      type: "civ",
      extractedData: {
        vin,
        fields: {},
        rawFields: {},
        documents: [
          {
            id: "card",
            documentType: "itp_card",
            pages: [1],
            vin,
            fields: {},
            rawFields: {},
          },
          {
            id: "certificate",
            documentType: "itp_certificate",
            pages: [2],
            vin,
            fields: {},
            rawFields: {},
          },
        ],
      },
    };
    tx.scooterDocument.findMany.mockResolvedValue([document]);
    await expect(
      service.create("scooter", {
        ...input,
        cardDocumentId: "bundle",
        certificateDocumentId: "bundle",
      }),
    ).resolves.toMatchObject({ id: "inspection" });
  });
  it("returns an identical record on a duplicate request and rejects conflicting rewrites", async () => {
    tx.scooterItpInspection.findUnique.mockResolvedValue({
      ...input,
      id: "existing",
      inspectionDate: new Date("2026-01-01"),
      validUntil: new Date("2027-01-01"),
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    });
    await expect(service.create("scooter", input)).resolves.toMatchObject({
      id: "existing",
    });
    await expect(
      service.create("scooter", { ...input, validUntil: "2028-01-01" }),
    ).rejects.toThrow("already recorded");
    expect(tx.scooterItpInspection.create).not.toHaveBeenCalled();
  });
});
