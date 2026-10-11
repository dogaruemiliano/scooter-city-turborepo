import { Prisma } from "../generated/prisma/client";
import { civMetadataWrite, civMetadataResponse } from "./civ-metadata";

describe("CIV metadata boundary", () => {
  it("preserves omitted metadata and explicitly clears raw JSON with database null", () => {
    expect(civMetadataWrite({})).toBeUndefined();
    expect(civMetadataWrite({ civRawFields: null })?.rawFields).toBe(
      Prisma.DbNull,
    );
    expect(civMetadataWrite({ civVersion: "2024" })).toEqual({
      version: "v2024",
      issuedAt: undefined,
      issuingAuthority: undefined,
      rawFields: undefined,
    });
  });
  it("uses unknown layout for legacy records and keeps original literal fields", () => {
    expect(civMetadataResponse(null)).toEqual({
      civVersion: "unknown",
      civIssuedAt: null,
      civIssuingAuthority: null,
      civRawFields: null,
    });
    const data = civMetadataWrite({
      civVersion: "1993",
      civIssuedAt: "2020-01-02",
      civRawFields: { "10": "unmapped", power: "-" },
    });
    expect(data?.version).toBe("v1993");
    expect(data?.issuedAt).toEqual(new Date("2020-01-02T00:00:00.000Z"));
    expect(data?.rawFields).toEqual({ "10": "unmapped", power: "-" });
  });
});
