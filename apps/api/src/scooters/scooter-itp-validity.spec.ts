import { writeScooterItpValidity } from "./scooter-itp-validity";
import type { Prisma } from "../generated/prisma/client";
const reading = {
  inspectionDate: "2026-01-01",
  validUntil: "2027-01-01",
  result: "passed",
  certificateNumber: null,
  odometerKm: null,
  rawFields: {},
};
function expectedData() {
  return {
    scooterId: "scooter",
    source: "document",
    validUntil: new Date("2027-01-01"),
    result: "passed",
    inspectionDate: new Date("2026-01-01"),
    effectiveDate: new Date(
      `${new Date().toISOString().slice(0, 10)}T00:00:00Z`,
    ),
    cardDocumentId: null,
    certificateDocumentId: "certificate",
  };
}
function setup(rows: object[] = [reading]) {
  const document = {
    id: "certificate",
    type: "itp_certificate",
    extractedData: {
      vin: null,
      fields: {},
      rawFields: {},
      documents: [
        {
          id: "certificate",
          documentType: "itp_certificate",
          pages: [1],
          vin: null,
          fields: {},
          rawFields: {},
          inspections: rows,
        },
      ],
    },
  };
  const scooter = { updatedAt: new Date("2026-01-01"), civDocument: null };
  const tx = {
    scooterItpInspection: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    scooterDocument: { findMany: jest.fn().mockResolvedValue([document]) },
    scooter: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(scooter),
      update: jest.fn(),
    },
  };
  return {
    tx,
    run: (date: string | null | undefined = undefined) =>
      writeScooterItpValidity(
        tx as unknown as Prisma.TransactionClient,
        "scooter",
        date,
        true,
      ),
  };
}
it("extracts only the validity date and preserves its document source", async () => {
  const { tx, run } = setup();
  await run();
  expect(tx.scooterItpInspection.create).toHaveBeenCalledWith({
    data: expectedData(),
  });
});
it("keeps an existing manual date until an explicit replacement is saved", async () => {
  const { tx, run } = setup();
  tx.scooterItpInspection.findFirst.mockResolvedValue({
    source: "manual",
    validUntil: new Date("2028-01-01"),
  });
  await run();
  expect(tx.scooterItpInspection.create).not.toHaveBeenCalled();
});
it("does not choose between conflicting extracted dates", async () => {
  const { tx, run } = setup([
    reading,
    { ...reading, validUntil: "2027-02-01" },
  ]);
  await run();
  expect(tx.scooterItpInspection.create).not.toHaveBeenCalled();
});
it("never treats a future appointment as completed inspection evidence", async () => {
  const { tx, run } = setup([
    { ...reading, inspectionDate: "2099-01-01", validUntil: "2099-12-31" },
  ]);
  await run();
  expect(tx.scooterItpInspection.create).not.toHaveBeenCalled();
});
it("keeps a newer failed inspection instead of reusing an older passed date", async () => {
  const { tx, run } = setup([
    reading,
    {
      ...reading,
      inspectionDate: "2026-02-01",
      validUntil: null,
      result: "failed",
    },
  ]);
  await run();
  expect(tx.scooterItpInspection.create).toHaveBeenCalledWith({
    data: {
      ...expectedData(),
      validUntil: null,
      result: "failed",
      inspectionDate: new Date("2026-02-01"),
    },
  });
});
