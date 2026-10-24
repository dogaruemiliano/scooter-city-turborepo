import assert from "node:assert/strict";
import test from "node:test";
import { v1 } from "../src";

test("CIV availability is optional for existing clients and independent of registration", () => {
  const input = {
    vin: "LXYTCKP05P0000001",
    brandId: "brand",
    powertrainType: "electric",
    registrationType: "unregistered",
  };
  assert.equal(
    v1.scooters.createScooterInputSchema.safeParse(input).success,
    true,
  );
  for (const civAvailability of v1.scooters.SCOOTER_CIV_AVAILABILITIES)
    assert.equal(
      v1.scooters.createScooterInputSchema.safeParse({
        ...input,
        civAvailability,
      }).success,
      true,
    );
  assert.equal(
    v1.scooters.updateScooterInputSchema.safeParse({
      civAvailability: "not_issued",
      civNumber: "C123",
    }).success,
    false,
  );
  assert.equal(
    v1.scooters.updateScooterInputSchema.safeParse({
      civAvailability: "issued",
      civNumber: null,
    }).success,
    true,
  );
});

test("not-issued validation includes CIV children in new mixed PDFs and extraction updates", () => {
  const extractedData = v1.scooters.scooterDocumentExtractedDataSchema.parse({
    vin: null,
    fields: {},
    rawFields: {},
    documents: [
      {
        id: "child",
        documentType: "civ",
        pages: [1],
        vin: null,
        fields: {},
        rawFields: {},
        issues: [],
      },
    ],
  });
  const documentDrafts = [
    {
      type: "foreign_registration",
      fileName: "mixed.pdf",
      uploadToken: "token",
      extractedData,
    },
  ];
  assert.equal(v1.scooters.hasScooterCivEvidence({ documentDrafts }), true);
  assert.equal(
    v1.scooters.createScooterInputSchema.safeParse({
      vin: "LXYTCKP05P0000001",
      brandId: "brand",
      powertrainType: "electric",
      civAvailability: "not_issued",
      documentDrafts,
    }).success,
    false,
  );
  assert.equal(
    v1.scooters.updateScooterInputSchema.safeParse({
      civAvailability: "not_issued",
      documentExtractions: [{ documentId: "mixed", extractedData }],
    }).success,
    false,
  );
});

test("corrected logical types supersede the original upload hint", () => {
  assert.equal(
    v1.scooters.hasScooterCivDocumentEvidence({
      type: "civ",
      extractedData: { documents: [{ documentType: "foreign_registration" }] },
    }),
    false,
  );
  assert.equal(
    v1.scooters.hasScooterCivDocumentEvidence({ type: "civ" }),
    true,
  );
});
