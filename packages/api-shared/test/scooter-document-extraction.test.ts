import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { v1 } from "../src";

const extractedData = {
  vin: "RFBV70010A1100233",
  fields: {
    brandName: "KYMCO",
    powerKw: 2.68,
    actualWeightKg: "-",
    model: null,
  },
  rawFields: { "P.2": "2,68", "15": null, "7": "-", "S.2": "0" },
};

test("manual VIN provenance survives document persistence and remains strict", () => {
  const reviewed = {
    ...extractedData,
    vinReview: { method: "manual", originalVin: null },
  };
  assert.deepEqual(
    v1.scooters.scooterDocumentDraftSchema.parse({
      type: "civ",
      fileName: "civ.pdf",
      uploadToken: "token",
      extractedData: reviewed,
    }).extractedData,
    reviewed,
  );
  for (const vinReview of [
    { method: "ai", originalVin: extractedData.vin },
    { method: "manual", originalVin: "bad" },
    { method: "manual" },
    { method: "manual", originalVin: null, unexpected: true },
  ])
    assert.equal(
      v1.scooters.scooterDocumentExtractedDataSchema.safeParse({
        ...extractedData,
        vinReview,
      }).success,
      false,
    );
});

test("per-document extraction preserves decimals, explicit dashes and unresolved nulls", () => {
  assert.deepEqual(
    v1.scooters.scooterDocumentExtractedDataSchema.parse(extractedData),
    extractedData,
  );
  assert.deepEqual(
    v1.scooters.scooterDocumentDraftSchema.parse({
      type: "import_document",
      fileName: "import.pdf",
      uploadToken: "token",
      extractedData,
    }).extractedData,
    extractedData,
  );
  assert.doesNotThrow(() => z.toJSONSchema(v1.scooters.scooterDocumentSchema));
});

test("extraction fields exclude operational data, database IDs and removed CIV mentions", () => {
  for (const field of [
    "hasGps",
    "odometerWorking",
    "speedometerWorking",
    "actualMaxSpeedKmh",
    "currentMileageKm",
    "notes",
    "brandId",
    "civMentions",
  ]) {
    assert.equal(
      v1.scooters.scooterDocumentExtractedDataSchema.safeParse({
        ...extractedData,
        fields: { [field]: "value" },
      }).success,
      false,
      field,
    );
  }
  for (const field of v1.scooters.INSURANCE_FIELDS) {
    assert.ok(
      v1.scooters.scooterDocumentExtractedDataSchema.safeParse({
        ...extractedData,
        fields: { [field]: null },
      }).success,
    );
  }
});

test("extraction evidence is bounded and rejects nested or invalid values", () => {
  for (const invalid of [
    {
      rawFields: Object.fromEntries(
        Array.from({ length: 101 }, (_, i) => [String(i), "-"]),
      ),
    },
    { rawFields: { ["x".repeat(121)]: "value" } },
    { rawFields: { source: "x".repeat(2001) } },
    { rawFields: { source: false } },
    { fields: { model: "x".repeat(2001) } },
    { fields: { powerKw: Number.POSITIVE_INFINITY } },
    { fields: { model: {} } },
    { vin: "different" },
  ])
    assert.equal(
      v1.scooters.scooterDocumentExtractedDataSchema.safeParse({
        ...extractedData,
        ...invalid,
      }).success,
      false,
    );
});

test("existing document extraction updates are bounded, unique and may clear evidence", () => {
  const documentExtractions = [
    { documentId: "first", extractedData },
    { documentId: "second", extractedData: null },
  ];
  assert.deepEqual(
    v1.scooters.updateScooterInputSchema.parse({ documentExtractions }),
    { documentExtractions },
  );
  assert.equal(
    v1.scooters.updateScooterInputSchema.safeParse({
      documentExtractions: [documentExtractions[0], documentExtractions[0]],
    }).success,
    false,
  );
  assert.equal(
    v1.scooters.updateScooterInputSchema.safeParse({
      documentExtractions: Array.from({ length: 21 }, (_, i) => ({
        documentId: String(i),
        extractedData: null,
      })),
    }).success,
    false,
  );
});

test("operational values preserve the distinctions between unknown, false and zero", () => {
  const base = {
    vin: extractedData.vin,
    brandId: "brand",
    powertrainType: "combustion",
  };
  const operational = {
    hasGps: false,
    odometerWorking: null,
    speedometerWorking: true,
    actualMaxSpeedKmh: 0,
  };
  assert.deepEqual(
    v1.scooters.updateScooterInputSchema.parse(operational),
    operational,
  );
  assert.deepEqual(
    v1.scooters.createScooterInputSchema.parse({ ...base, ...operational }),
    { ...base, ...operational },
  );
  for (const actualMaxSpeedKmh of [-1, 1.2, 2147483648]) {
    assert.equal(
      v1.scooters.updateScooterInputSchema.safeParse({ actualMaxSpeedKmh })
        .success,
      false,
    );
  }
  assert.equal(
    v1.scooters.createScooterInputSchema.safeParse({
      ...base,
      civMentions: "removed",
    }).success,
    false,
  );
});
