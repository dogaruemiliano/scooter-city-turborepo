import assert from "node:assert/strict";
import test from "node:test";
import { v1 } from "../src";

const vin = "LXYTCKP05P0000001";
const another = "LXYTCKP05P0000002";
test("VIN authority is limited to CIV, insurance and ITP certificates", () => {
  const types = ["civ", "insurance", "itp_certificate"];
  for (const [index, type] of types.entries()) {
    assert.equal(
      v1.scooters.preferredScooterDocumentVin([
        ...types
          .slice(index + 1)
          .map((documentType) => ({ documentType, vin: another })),
        { documentType: type, vin },
      ]),
      vin,
    );
  }
  assert.equal(
    v1.scooters.preferredScooterDocumentVin([
      { documentType: "civ", vin: null },
      { documentType: "itp_certificate", vin },
    ]),
    vin,
  );
});
test("handwritten registration and yellow ITP cards never supply a VIN", () => {
  for (const documentType of [
    "registration_certificate",
    "itp_card",
    "other",
    "import_document",
    "foreign_registration",
    "export_certificate",
    "ownership_proof",
  ]) {
    assert.equal(v1.scooters.scooterDocumentReadsVin(documentType), false);
    assert.equal(
      v1.scooters.preferredScooterDocumentVin([{ documentType, vin }]),
      null,
    );
  }
});

test("yellow-card inspection evidence survives consumption without supplying scooter fields or identity", () => {
  const evidence: v1.scooters.ScooterDocumentExtractedData = {
    vin,
    fields: { registrationNumber: "AI PLATE" },
    rawFields: {},
    documents: [
      {
        id: "card",
        documentType: "itp_card",
        pages: [1],
        vin,
        fields: { registrationNumber: "AI PLATE" },
        rawFields: {},
        inspections: [
          {
            inspectionDate: null,
            validUntil: "2028-09-14",
            result: null,
            certificateNumber: "B0123ABC45",
            odometerKm: null,
            rawFields: { date: "14/09/28" },
          },
        ],
      },
    ],
  };
  const result = v1.scooters.scooterDocumentExtractionForType(
    "itp_card",
    evidence,
  );
  assert.equal(result.vin, null);
  assert.deepEqual(result.fields, {});
  assert.equal(result.documents?.[0]?.vin, null);
  assert.deepEqual(result.documents?.[0]?.fields, {});
  assert.equal(
    result.documents?.[0]?.inspections?.[0]?.validUntil,
    "2028-09-14",
  );
});
test("purchase proof and a paired client copy are valid without CIV or registration", () => {
  for (const type of ["ownership_proof", "export_certificate", "other"]) {
    assert.equal(
      v1.scooters.createScooterInputSchema.safeParse({
        vin,
        brandId: "brand",
        powertrainType: "electric",
        registrationType: "unregistered",
        civAvailability: "not_issued",
        documentDrafts: [{ type, fileName: "proof.pdf", uploadToken: "token" }],
      }).success,
      true,
    );
  }
  assert.equal(
    v1.scooters.scooterDocumentDraftSchema.safeParse({
      type: "ownership_proof",
      fileName: "purchase.pdf",
      uploadToken: "original",
      clientCopy: {
        fileName: "client.pdf",
        uploadToken: "client",
        uploadType: "unclassified",
      },
    }).success,
    true,
  );
});

test("a registration certificate requires manual registration and a plate when creating", () => {
  const input = {
    vin,
    brandId: "brand",
    powertrainType: "electric",
    registrationType: "unregistered",
    documentDrafts: [
      {
        type: "registration_certificate",
        fileName: "registration.pdf",
        uploadToken: "token",
      },
    ],
  };
  assert.equal(
    v1.scooters.createScooterInputSchema.safeParse(input).success,
    false,
  );
  assert.equal(
    v1.scooters.createScooterInputSchema.safeParse({
      ...input,
      registrationType: "local",
    }).success,
    false,
  );
  assert.equal(
    v1.scooters.createScooterInputSchema.safeParse({
      ...input,
      registrationType: "local",
      registrationNumber: "VL 18 167",
    }).success,
    true,
  );
  const mixed = {
    ...input,
    documentDrafts: [
      {
        ...input.documentDrafts[0],
        type: "civ",
        extractedData: {
          vin,
          fields: {},
          rawFields: {},
          documents: [
            {
              id: "registration",
              documentType: "registration_certificate",
              pages: [1],
              vin: null,
              fields: {},
              rawFields: {},
            },
          ],
        },
      },
    ],
  };
  assert.equal(
    v1.scooters.createScooterInputSchema.safeParse(mixed).success,
    false,
  );
});

test("old mixed readings retain classification while excluded data cannot reach the form", () => {
  const evidence: v1.scooters.ScooterDocumentExtractedData = {
    vin,
    fields: { model: "Printed model", registrationNumber: "AI PLATE" },
    rawFields: {
      "civ:model": "Printed model",
      "registration:plate": "AI PLATE",
    },
    documents: [
      {
        id: "civ",
        documentType: "civ",
        pages: [1],
        vin,
        fields: { model: "Printed model" },
        rawFields: { model: "Printed model" },
      },
      {
        id: "registration",
        documentType: "registration_certificate",
        pages: [2],
        vin: another,
        fields: { registrationNumber: "AI PLATE" },
        rawFields: { plate: "AI PLATE" },
      },
    ],
  };
  const result = v1.scooters.scooterDocumentExtractionForType("civ", evidence);
  assert.deepEqual(result.fields, { model: "Printed model" });
  assert.deepEqual(result.rawFields, { "civ:model": "Printed model" });
  assert.equal(result.documents?.[1]?.documentType, "registration_certificate");
  assert.deepEqual(result.documents?.[1]?.fields, {});
  assert.equal(result.documents?.[1]?.vin, null);
  assert.equal(evidence.documents?.[1]?.vin, another);
});
