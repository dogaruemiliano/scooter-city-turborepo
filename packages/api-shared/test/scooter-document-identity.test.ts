import assert from "node:assert/strict";
import test from "node:test";
import { v1 } from "../src";

const vin = "LXYTCKP05P0000001";
const another = "LXYTCKP05P0000002";
test("VIN authority is CIV, insurance, export, foreign registration, then other eligible documents", () => {
  const types = [
    "civ",
    "insurance",
    "export_certificate",
    "foreign_registration",
    "ownership_proof",
  ];
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
      { documentType: "export_certificate", vin },
    ]),
    vin,
  );
});
test("handwritten registration and yellow ITP cards never supply a VIN", () => {
  for (const documentType of [
    "registration_certificate",
    "itp_card",
    "other",
  ]) {
    assert.equal(v1.scooters.scooterDocumentReadsVin(documentType), false);
    assert.equal(
      v1.scooters.preferredScooterDocumentVin([{ documentType, vin }]),
      null,
    );
  }
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
