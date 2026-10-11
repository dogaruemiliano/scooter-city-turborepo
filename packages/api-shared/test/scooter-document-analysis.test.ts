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
  ]) {
    assert.doesNotThrow(() =>
      z.toJSONSchema(schema, { target: "openapi-3.0", io: "input" }),
    );
    assert.doesNotThrow(() => z.toJSONSchema(schema));
  }
});
