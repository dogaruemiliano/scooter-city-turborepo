import assert from "node:assert/strict";
import test from "node:test";
import { v1 } from "../src";
const upload = {
  type: "civ",
  contentType: "application/pdf",
  byteSize: 100,
  checksumSha256: "a".repeat(64),
};

test("scooter uploads accept only the supported document types and supported files", () => {
  assert.ok(
    v1.scooters.createScooterDocumentUploadSchema.safeParse({
      ...upload,
      byteSize: 15 * 1024 * 1024,
    }).success,
  );
  for (const type of v1.scooters.SCOOTER_DOCUMENT_TYPES) {
    for (const contentType of v1.scooters.SCOOTER_DOCUMENT_CONTENT_TYPES) {
      assert.ok(
        v1.scooters.createScooterDocumentUploadSchema.safeParse({
          ...upload,
          type,
          contentType,
        }).success,
      );
    }
  }
  for (const invalid of [
    { sessionId: "" },
    { sessionId: "x".repeat(121) },
    { type: "unknown" },
    { contentType: "image/svg+xml" },
    { byteSize: 0 },
    { byteSize: v1.scooters.SCOOTER_DOCUMENT_MAX_BYTES + 1 },
    { checksumSha256: "bad" },
  ]) {
    assert.equal(
      v1.scooters.createScooterDocumentUploadSchema.safeParse({
        ...upload,
        ...invalid,
      }).success,
      false,
    );
  }
});

test("new upload and save requests bind to a session while legacy inputs remain accepted", () => {
  const sessionId = "editor-session";
  assert.equal(
    v1.scooters.createScooterDocumentUploadSchema.parse({
      ...upload,
      sessionId,
    }).sessionId,
    sessionId,
  );
  assert.equal(
    v1.scooters.createScooterInputSchema.parse({
      sessionId,
      vin: "LXYTCKP05P0000001",
      brandId: "brand",
      powertrainType: "electric",
    }).sessionId,
    sessionId,
  );
  assert.deepEqual(v1.scooters.updateScooterInputSchema.parse({ sessionId }), {
    sessionId,
  });
  assert.equal(
    v1.scooters.updateScooterInputSchema.safeParse({ sessionId: "" }).success,
    false,
  );
});

test("document-only edits and multi-page drafts are supported without altering scooter fields", () => {
  const drafts = [
    { type: "civ", fileName: "CIV.pdf", uploadToken: "token" },
    {
      type: "registration_certificate",
      fileName: "front.jpg",
      uploadToken: "token2",
    },
  ];
  assert.deepEqual(
    v1.scooters.updateScooterInputSchema.parse({
      documentDrafts: drafts,
      removedDocumentIds: ["old-id"],
    }),
    { documentDrafts: drafts, removedDocumentIds: ["old-id"] },
  );
  for (const fileName of ["", "../file.pdf", "file\n.pdf", "x".repeat(256)]) {
    assert.equal(
      v1.scooters.scooterDocumentDraftSchema.safeParse({
        ...drafts[0],
        fileName,
      }).success,
      false,
    );
  }
  assert.equal(
    v1.scooters.scooterDocumentDraftsSchema.safeParse(Array(21).fill(drafts[0]))
      .success,
    false,
  );
});

test("unclassified is an upload state, never a saved document category", () => {
  assert.ok(
    v1.scooters.createScooterDocumentUploadSchema.safeParse({
      ...upload,
      type: "unclassified",
    }).success,
  );
  const draft = {
    fileName: "scan.pdf",
    uploadToken: "token",
    uploadType: "unclassified",
  };
  assert.ok(
    v1.scooters.scooterDocumentDraftSchema.safeParse({ ...draft, type: "civ" })
      .success,
  );
  assert.equal(
    v1.scooters.scooterDocumentDraftSchema.safeParse({
      ...draft,
      type: "unclassified",
    }).success,
    false,
  );
  assert.equal(
    v1.scooters.scooterDocumentDraftSchema.safeParse({
      ...draft,
      type: "civ",
      uploadType: "insurance",
    }).success,
    false,
  );
});
