import { v1 } from "@repo/api-shared";
import { Prisma, type VehicleCivDocument } from "../generated/prisma/client";
import { toDateOnlyDate, toDateOnlyString } from "../common/dates/date-only";

const versions = {
  "1993": "v1993",
  "2016": "v2016",
  "2024": "v2024",
  unknown: "unknown",
} as const;
type CivInput = Pick<
  v1.scooters.UpdateScooterInput,
  "civVersion" | "civIssuedAt" | "civIssuingAuthority" | "civRawFields"
>;

/** Missing properties are left untouched; explicit null clears that metadata value. */
export function civMetadataWrite(
  input: CivInput,
): Prisma.VehicleCivDocumentCreateWithoutScooterInput | undefined {
  if (
    [
      input.civVersion,
      input.civIssuedAt,
      input.civIssuingAuthority,
      input.civRawFields,
    ].every((value) => value === undefined)
  )
    return undefined;
  return {
    version:
      input.civVersion === undefined ? undefined : versions[input.civVersion],
    issuedAt:
      input.civIssuedAt === undefined
        ? undefined
        : input.civIssuedAt === null
          ? null
          : toDateOnlyDate(input.civIssuedAt),
    issuingAuthority: input.civIssuingAuthority,
    rawFields: input.civRawFields === null ? Prisma.DbNull : input.civRawFields,
  };
}

/** Public CIV metadata contains the literal original strings, including dashes. */
export function civMetadataResponse(
  document?: VehicleCivDocument | null,
): CivInput {
  return {
    civVersion: document
      ? (
          {
            v1993: "1993",
            v2016: "2016",
            v2024: "2024",
            unknown: "unknown",
          } as const
        )[document.version]
      : "unknown",
    civIssuedAt: document?.issuedAt
      ? toDateOnlyString(document.issuedAt)
      : null,
    civIssuingAuthority: document?.issuingAuthority ?? null,
    civRawFields:
      document?.rawFields == null
        ? null
        : v1.vehicleCiv.civRawFieldsSchema.parse(document.rawFields),
  };
}
