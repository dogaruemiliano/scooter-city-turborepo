import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { v1 } from "../src";

const draft = {
  sourceId: "draft-civ",
  source: { kind: "draft", type: "civ", uploadToken: "signed-token" },
};
const saved = {
  sourceId: "saved-civ",
  source: { kind: "saved", scooterId: "scooter", documentId: "document" },
};

test("direct extraction accepts draft tokens and saved document references", () => {
  for (const input of [draft, saved])
    assert.deepEqual(
      v1.scooters.analyzeScooterDocumentInputSchema.parse(input),
      input,
    );
  assert.equal(
    v1.scooters.ROUTES.documents.extract,
    "/v1/scooters/document-extraction",
  );
});

test("direct extraction rejects ambiguous or caller-controlled file locations", () => {
  for (const input of [
    { ...draft, sourceId: "" },
    { ...draft, sourceId: "x".repeat(121) },
    { ...draft, source: { ...draft.source, uploadToken: "" } },
    { ...draft, source: { ...draft.source, uploadToken: "x".repeat(8193) } },
    { ...draft, source: { ...draft.source, type: "passport" } },
    { ...draft, source: { ...draft.source, documentId: "saved-document" } },
    { ...draft, source: { ...draft.source, url: "https://example.com/a.pdf" } },
    { ...draft, source: { ...draft.source, storageKey: "foreign/file.pdf" } },
    { ...saved, source: { kind: "saved", documentId: "document" } },
    { ...saved, source: { ...saved.source, type: "insurance" } },
    { ...saved, documents: [draft] },
  ])
    assert.equal(
      v1.scooters.analyzeScooterDocumentInputSchema.safeParse(input).success,
      false,
    );
});

const analysis = {
  sourceId: "draft-civ",
  documentType: "civ",
  extractedData: {
    vin: null,
    fields: { powerKw: 2.68, vehicleClass: "-", seatsCount: 0, model: null },
    rawFields: { "P.2": "2,68", "3": "-", "S.1": "0" },
  },
  issues: [{ field: "vin", code: "unreadable" }],
  reviewRequired: true,
};

test("direct extraction retains unresolved VINs, dashes, zeroes and field issues", () => {
  assert.deepEqual(
    v1.scooters.scooterDocumentAnalysisSchema.parse(analysis),
    analysis,
  );
  for (const invalid of [
    { reviewRequired: false },
    { sourceId: "" },
    { documentType: "unknown" },
    { issues: [{ field: "vin", code: "looksGood" }] },
    { issues: [{ field: "", code: "unreadable" }] },
    { issues: Array.from({ length: 201 }, () => analysis.issues[0]) },
    { extractedData: { ...analysis.extractedData, fields: { hasGps: true } } },
  ])
    assert.equal(
      v1.scooters.scooterDocumentAnalysisSchema.safeParse({
        ...analysis,
        ...invalid,
      }).success,
      false,
    );
});

test("direct extraction contracts can generate OpenAPI without transforms", () => {
  for (const schema of [
    v1.scooters.analyzeScooterDocumentInputSchema,
    v1.scooters.scooterDocumentAnalysisSchema,
    v1.scooters.scooterDocumentEditorSessionSchema,
    v1.scooters.discardScooterDocumentEditorSessionSchema,
    v1.scooters.startScooterDocumentExtractionJobInputSchema,
    v1.scooters.scooterDocumentExtractionJobSchema,
  ]) {
    assert.doesNotThrow(() =>
      z.toJSONSchema(schema, { target: "openapi-3.0", io: "input" }),
    );
    assert.doesNotThrow(() => z.toJSONSchema(schema));
  }
});

test("durable extraction requires a session and stable attempt identity", () => {
  const input = { ...draft, sessionId: "session", attemptId: "attempt" };
  assert.deepEqual(
    v1.scooters.startScooterDocumentExtractionJobInputSchema.parse(input),
    input,
  );
  for (const invalid of [
    draft,
    { ...input, sessionId: "" },
    { ...input, attemptId: "x".repeat(121) },
    { ...input, fileUrl: "https://example.com/private.pdf" },
    {
      ...input,
      source: { ...draft.source, url: "https://example.com/private.pdf" },
    },
  ])
    assert.equal(
      v1.scooters.startScooterDocumentExtractionJobInputSchema.safeParse(
        invalid,
      ).success,
      false,
    );
});

test("durable jobs only include matching evidence when completed", () => {
  const job = {
    id: "job",
    sourceId: analysis.sourceId,
    documentType: analysis.documentType,
    status: "queued",
    expiresAt: "2026-10-12T12:00:00.000Z",
    retryAfterMs: 1000,
  };
  for (const status of v1.scooters.SCOOTER_DOCUMENT_EXTRACTION_JOB_STATUSES)
    assert.equal(
      v1.scooters.scooterDocumentExtractionJobSchema.safeParse({
        ...job,
        status,
        ...(status === "completed" ? { result: analysis } : {}),
      }).success,
      true,
    );
  for (const invalid of [
    { ...job, status: "completed" },
    { ...job, result: analysis },
    {
      ...job,
      status: "completed",
      result: { ...analysis, sourceId: "another" },
    },
    {
      ...job,
      status: "completed",
      result: { ...analysis, documentType: "insurance" },
    },
    { ...job, providerResponseId: "response-secret" },
    { ...job, fileUrl: "https://example.com/private.pdf" },
    { ...job, retryAfterMs: -1 },
    { ...job, expiresAt: "invalid" },
  ])
    assert.equal(
      v1.scooters.scooterDocumentExtractionJobSchema.safeParse(invalid).success,
      false,
    );
});

test("editor sessions have bounded identities and encode route parameters", () => {
  assert.deepEqual(
    v1.scooters.scooterDocumentEditorSessionSchema.parse({
      id: "session",
      expiresAt: "2026-10-12T12:00:00.000Z",
    }),
    { id: "session", expiresAt: "2026-10-12T12:00:00.000Z" },
  );
  assert.equal(
    v1.scooters.scooterDocumentEditorSessionSchema.safeParse({
      id: "",
      expiresAt: "invalid",
    }).success,
    false,
  );
  assert.equal(
    v1.scooters.ROUTES.documents.extractionJob("a/b"),
    "/v1/scooters/document-extraction-jobs/a%2Fb",
  );
  assert.equal(
    v1.scooters.ROUTES.documents.cancelExtractionJob("a/b"),
    "/v1/scooters/document-extraction-jobs/a%2Fb/cancel",
  );
  assert.equal(
    v1.scooters.ROUTES.documents.discardEditorSession("a/b"),
    "/v1/scooters/document-editor-sessions/a%2Fb/discard",
  );
});
