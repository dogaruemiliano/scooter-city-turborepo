import { v1 } from "@repo/api-shared";
import {
  civAvailabilityWrite,
  hasAttachedCivEvidence,
} from "./civ-availability";
import type { VehicleCivDocument } from "../generated/prisma/client";

it("keeps missing CIV evidence unknown and supports scooters whose CIV is not issued", () => {
  expect(civAvailabilityWrite({})).toBe("unknown");
  expect(
    civAvailabilityWrite({
      civVersion: "unknown",
      civIssuedAt: null,
      civRawFields: {},
    }),
  ).toBe("unknown");
  expect(civAvailabilityWrite({ civAvailability: "not_issued" })).toBe(
    "not_issued",
  );
  expect(civAvailabilityWrite({ civAvailability: "issued" })).toBe("issued");
});

it("recognizes actual CIV evidence and rejects contradictory not-issued changes", () => {
  expect(civAvailabilityWrite({ civNumber: "C123" })).toBe("issued");
  expect(civAvailabilityWrite({ civIssuedAt: "2026-01-01" })).toBe("issued");
  expect(() =>
    civAvailabilityWrite({ civAvailability: "not_issued", civNumber: "C123" }),
  ).toThrow();
  expect(() =>
    civAvailabilityWrite(
      { civAvailability: "not_issued" },
      {
        civAvailability: "issued",
        civNumber: "C123",
      },
    ),
  ).toThrow();
  expect(() =>
    civAvailabilityWrite(
      { civAvailability: "not_issued" },
      {
        civAvailability: "issued",
        civNumber: null,
        civDocument: {
          version: "v2024",
          issuedAt: null,
          issuingAuthority: null,
          rawFields: null,
        } as VehicleCivDocument,
      },
    ),
  ).toThrow();
});

it("allows an admin to correct an erroneous CIV status when conflicting metadata is explicitly cleared", () => {
  expect(
    civAvailabilityWrite(
      { civAvailability: "not_issued", civNumber: null },
      {
        civAvailability: "issued",
        civNumber: "wrong previous reading",
      },
    ),
  ).toBe("not_issued");
});

it("recognizes CIV children in mixed PDFs and reviewed extraction updates", () => {
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
  const document = { id: "mixed", type: "foreign_registration", extractedData };
  expect(hasAttachedCivEvidence([document])).toBe(true);
  expect(
    hasAttachedCivEvidence(
      [document],
      [{ documentId: "mixed", extractedData: null }],
    ),
  ).toBe(false);
  expect(
    hasAttachedCivEvidence(
      [{ ...document, type: "civ" }],
      [{ documentId: "mixed", extractedData: null }],
    ),
  ).toBe(true);
  expect(
    civAvailabilityWrite({
      documentExtractions: [{ documentId: "mixed", extractedData }],
    }),
  ).toBe("issued");
  expect(() =>
    civAvailabilityWrite({
      civAvailability: "not_issued",
      documentExtractions: [{ documentId: "mixed", extractedData }],
    }),
  ).toThrow();
});
