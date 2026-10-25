import { describe, expect, it } from "vitest";
import type { v1 } from "@repo/api-shared";
import {
  hasClientCopyFileName,
  resolveDocumentVersions,
  type DocumentVersionCandidate,
} from "./scooter-document-versions";
const VIN = "LXYTCKP05P0000001";
const doc = (id: string, name: string): DocumentVersionCandidate => ({
  id,
  file: { name },
  type: "civ",
});
const evidence = (
  number: string,
  copy = false,
  vin = VIN,
): v1.scooters.ScooterDocumentExtractedData => ({
  vin,
  fields: { civNumber: number },
  rawFields: {},
  ...(copy ? { clientCopy: true } : {}),
});

describe("automatic client document versions", () => {
  it.each([
    "CIV 007_CLIENT.pdf",
    "CIV 007 - client copy.pdf",
    "CIV 007_copie client.jpg",
    "CIV 007 pentru client.pdf",
    "CIV 007-watermarked.pdf",
    "CIV 007 cu logo.pdf",
  ])("recognizes the protected filename %s", (name) => {
    expect(hasClientCopyFileName(name)).toBe(true);
    expect(
      resolveDocumentVersions(
        [doc("original", "CIV 007.pdf"), doc("copy", name)],
        {},
      )[1],
    ).toMatchObject({
      version: "client_copy",
      originalId: "original",
      versionSource: "filename",
    });
  });
  it.each(["CIV.pdf", "CIV (1).pdf", "CIV copy.pdf", "clientele.pdf"])(
    "does not mistake ordinary duplicate/partial filenames for protection: %s",
    (name) => {
      expect(hasClientCopyFileName(name)).toBe(false);
    },
  );
  it("matches a renamed overlay copy using its own document number", () => {
    const result = resolveDocumentVersions(
      [doc("o", "scan.pdf"), doc("c", "download.pdf")],
      { o: evidence("C123"), c: evidence("C123", true) },
    );
    expect(result[1]).toMatchObject({
      version: "client_copy",
      versionSource: "branded_overlay",
      originalId: "o",
    });
  });
  it("does not match a copy to a different document belonging to the same scooter", () => {
    expect(
      resolveDocumentVersions(
        [doc("o", "CIV.pdf"), doc("c", "CIV client.pdf")],
        { o: evidence("C123"), c: evidence("C456", true) },
      )[1].originalId,
    ).toBeUndefined();
    expect(
      resolveDocumentVersions(
        [doc("o", "scan.pdf"), doc("c", "download.pdf")],
        {
          o: { vin: VIN, fields: {}, rawFields: {} },
          c: { vin: VIN, fields: {}, rawFields: {}, clientCopy: true },
        },
      )[1].originalId,
    ).toBeUndefined();
  });
  it("rejects conflicting VINs even when filenames match", () => {
    expect(
      resolveDocumentVersions(
        [doc("o", "CIV.pdf"), doc("c", "CIV client.pdf")],
        { o: evidence("C123"), c: evidence("C123", true, "RFBV70010A1100233") },
      )[1].originalId,
    ).toBeUndefined();
  });
  it("does not guess between duplicate originals or competing copies", () => {
    const originals = [
      doc("one", "CIV.pdf"),
      doc("two", "CIV.pdf"),
      doc("c", "CIV client.pdf"),
    ];
    expect(
      resolveDocumentVersions(originals, {})[2].originalId,
    ).toBeUndefined();
    const copies = [
      doc("o", "CIV.pdf"),
      doc("one", "CIV client.pdf"),
      doc("two", "CIV watermarked.pdf"),
    ];
    expect(
      resolveDocumentVersions(copies, {})
        .slice(1)
        .every((item) => !item.originalId),
    ).toBe(true);
  });
  it("matches independent of order and respects an operator correction", () => {
    expect(
      resolveDocumentVersions(
        [doc("c", "CIV client.pdf"), doc("o", "CIV.pdf")],
        {},
      )[0].originalId,
    ).toBe("o");
    expect(
      resolveDocumentVersions(
        [
          {
            ...doc("c", "CIV client.pdf"),
            version: "original",
            versionSource: "manual",
          },
          doc("o", "CIV.pdf"),
        ],
        { c: evidence("C123", true) },
      )[0],
    ).toMatchObject({ version: "original", versionSource: "manual" });
  });
});
