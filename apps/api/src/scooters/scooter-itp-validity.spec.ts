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
      count: jest.fn().mockResolvedValue(1),
    },
    scooterDocument: { findMany: jest.fn().mockResolvedValue([document]) },
    scooter: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(scooter),
      update: jest.fn(),
    },
  };
  return {
    tx,
    document,
    run: (
      date: string | null | undefined = undefined,
      documentsChanged = true,
      civMetadataChanged = false,
    ) =>
      writeScooterItpValidity(
        tx as unknown as Prisma.TransactionClient,
        "scooter",
        date,
        documentsChanged,
        civMetadataChanged,
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

function pairedSetup(cardDate: string | null = "2028-09-14") {
  const state = setup([
    {
      ...reading,
      inspectionDate: "2026-09-14",
      validUntil: null,
      certificateNumber: "B0123ABC45 / DD12345",
    },
  ]);
  const card = structuredClone(state.document);
  card.id = "card";
  card.type = "itp_card";
  card.extractedData.documents[0].documentType = "itp_card";
  card.extractedData.documents[0].inspections = [
    {
      ...reading,
      inspectionDate: null,
      validUntil: cardDate,
      result: null,
      certificateNumber: "B0123 ABC45",
    },
  ];
  state.tx.scooterDocument.findMany.mockResolvedValue([state.document, card]);
  return { ...state, card };
}

it("saves the certificate result with the yellow card's expiry and links both originals", async () => {
  const { tx, run } = pairedSetup();
  await run();
  expect(tx.scooterItpInspection.create).toHaveBeenCalledWith({
    data: {
      ...expectedData(),
      validUntil: new Date("2028-09-14"),
      inspectionDate: new Date("2026-09-14"),
      cardDocumentId: "card",
    },
  });
});

it("records a manually corrected unreadable expiry separately and keeps both document links", async () => {
  const { tx, run, document } = pairedSetup(null);
  await run("2028-09-14");
  expect(tx.scooterItpInspection.create).toHaveBeenCalledWith({
    data: {
      ...expectedData(),
      source: "manual",
      validUntil: new Date("2028-09-14"),
      inspectionDate: new Date("2026-09-14"),
      cardDocumentId: "card",
    },
  });
  expect(
    (
      document.extractedData.documents[0].inspections[0] as {
        validUntil: string | null;
      }
    ).validUntil,
  ).toBeNull();
});

it("does not automatically choose a contradictory expiry printed on the certificate", async () => {
  const { tx, run, document } = pairedSetup();
  (
    document.extractedData.documents[0].inspections[0] as {
      validUntil: string | null;
    }
  ).validUntil = "2027-09-14";
  await run();
  expect(tx.scooterItpInspection.create).not.toHaveBeenCalled();
});
it("keeps both source links for manual recovery even when the card has no readable rows", async () => {
  const { tx, run, card } = pairedSetup(null);
  card.extractedData.documents[0].inspections = [];
  await run("2028-09-14");
  expect(tx.scooterItpInspection.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      source: "manual",
      result: "passed",
      cardDocumentId: "card",
      certificateDocumentId: "certificate",
    }) as unknown,
  });
});

it("never marks a lone yellow-card expiry as a passed inspection", async () => {
  const { tx, run, card } = pairedSetup();
  tx.scooterDocument.findMany.mockResolvedValue([card]);
  await run();
  expect(tx.scooterItpInspection.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      result: "unknown",
      cardDocumentId: "card",
      certificateDocumentId: null,
    }) as unknown,
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
it.each([
  { count: 1, documentsChanged: true, civMetadataChanged: false },
  { count: 1, documentsChanged: false, civMetadataChanged: true },
  { count: 2, documentsChanged: true, civMetadataChanged: true },
])(
  "reconciles recovered initial CIV validity only with a lone manual row: %j",
  async ({ count, documentsChanged, civMetadataChanged }) => {
    const { tx, run } = setup([]);
    tx.scooterItpInspection.findFirst.mockResolvedValue({
      source: "manual",
      result: "unknown",
      validUntil: new Date("2028-08-21"),
    });
    tx.scooterItpInspection.count.mockResolvedValue(count);
    tx.scooter.findUniqueOrThrow.mockResolvedValue({
      updatedAt: new Date("2026-01-01"),
      civDocument: { issuedAt: new Date("2026-08-21") },
    });
    await run(undefined, documentsChanged, civMetadataChanged);
    if (count === 1)
      expect(tx.scooterItpInspection.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          source: "manual",
          result: "passed",
          validUntil: new Date("2028-08-21"),
        }) as unknown,
      });
    else expect(tx.scooterItpInspection.create).not.toHaveBeenCalled();
  },
);
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
it("treats an explicitly entered validity date as a manual confirmation", async () => {
  const { tx, run } = setup([]);
  await run("2028-08-21");
  expect(tx.scooterItpInspection.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      source: "manual",
      result: "passed",
      validUntil: new Date("2028-08-21"),
      inspectionDate: null,
    }) as unknown,
  });
});
it("lets an explicit save confirm a previously unknown manual validity date", async () => {
  const { tx, run } = setup([]);
  tx.scooterItpInspection.findFirst.mockResolvedValue({
    source: "manual",
    result: "unknown",
    validUntil: new Date("2028-08-21"),
  });
  await run("2028-08-21");
  expect(tx.scooterItpInspection.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      result: "passed",
      source: "manual",
    }) as unknown,
  });
});
it("does not turn unreadable document results into a passed inspection", async () => {
  const { tx, run } = setup([{ ...reading, result: "unknown" }]);
  await run("2027-01-01");
  expect(tx.scooterItpInspection.create).toHaveBeenCalledWith({
    data: { ...expectedData(), result: "unknown" },
  });
});
it("requires review when a date-only edit would override a known failure", async () => {
  const { tx, run } = setup([]);
  tx.scooterItpInspection.findFirst.mockResolvedValue({
    source: "manual",
    result: "failed",
    validUntil: null,
  });
  await run("2028-08-21");
  expect(tx.scooterItpInspection.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ result: "unknown" }) as unknown,
  });
});
it("does not let a manual expiry correction reuse an older pass after a known failed inspection", async () => {
  const { tx, run } = pairedSetup(null);
  tx.scooterItpInspection.findFirst.mockResolvedValue({
    source: "document",
    result: "failed",
    validUntil: null,
    inspectionDate: new Date("2026-10-01"),
  });
  await run("2028-09-14");
  expect(tx.scooterItpInspection.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ result: "unknown" }) as unknown,
  });
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
