import { v1 } from "@repo/api-shared";

export interface ScooterVinCorrection {
  sourceId: string;
  previousVin: string | null;
  vin: string;
}

/** Called only for an operator's explicit correction after reviewing the document. */
export function reviewScooterDocumentVin(
  analysis: v1.scooters.ScooterDocumentAnalysis,
  value: string,
): v1.scooters.ScooterDocumentAnalysis | null {
  const parsed =
    v1.scooters.scooterDocumentExtractedDataSchema.shape.vin.safeParse(value);
  if (!parsed.success || !parsed.data) return null;
  const vin = parsed.data;
  const data = analysis.extractedData;
  if (vin === data.vin) return analysis;
  const fields = { ...data.fields };
  for (const field of ["vin", "documentVin"])
    if (Object.hasOwn(fields, field)) fields[field] = vin;
  return {
    ...analysis,
    extractedData: {
      ...data,
      vin,
      fields,
      vinReview: {
        method: "manual",
        originalVin: data.vinReview ? data.vinReview.originalVin : data.vin,
      },
    },
    issues: analysis.issues.filter(
      (issue) => !["vin", "documentVin"].includes(issue.field),
    ),
  };
}
