import { BadRequestException } from "@nestjs/common";
import { v1 } from "@repo/api-shared";
import type { Scooter, VehicleCivDocument } from "../generated/prisma/client";
import { civMetadataResponse } from "./civ-metadata";

/** Test the evidence that will remain after this update, including reviewed mixed-PDF children. */
export function hasAttachedCivEvidence(
  documents: readonly { id: string; type: string; extractedData: unknown }[],
  updates: readonly v1.scooters.ScooterDocumentExtractionUpdate[] = [],
): boolean {
  const revised = new Map(
    updates.map((update) => [update.documentId, update.extractedData]),
  );
  return documents.some((document) =>
    v1.scooters.hasScooterCivDocumentEvidence({
      type: document.type,
      extractedData: revised.has(document.id)
        ? revised.get(document.id)
        : document.extractedData,
    }),
  );
}

/** Unknown is preserved until an admin declares issuance or provides actual CIV evidence. */
export function civAvailabilityWrite(
  input: v1.scooters.UpdateScooterInput,
  existing?: Pick<Scooter, "civAvailability" | "civNumber"> & {
    civDocument?: VehicleCivDocument | null;
  },
): v1.scooters.ScooterCivAvailability {
  const evidence = v1.scooters.hasScooterCivEvidence({
    ...civMetadataResponse(existing?.civDocument),
    civNumber: existing?.civNumber,
    ...input,
  });
  if (input.civAvailability === "not_issued" && evidence)
    throw new BadRequestException({
      code: "SCOOTER_CIV_AVAILABILITY_CONFLICT",
      message:
        "Remove conflicting CIV evidence before marking CIV as not issued.",
      details: { field: "civAvailability" },
    });
  return (
    input.civAvailability ??
    (evidence ? "issued" : (existing?.civAvailability ?? "unknown"))
  );
}
