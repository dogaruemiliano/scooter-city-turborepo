import { v1 } from "@repo/api-shared";

export interface ScooterVinCorrection {
  sourceId: string;
  documentId?: string;
  previousVin: string | null;
  vin: string;
}

/** Review the same individual readings that are used to block saving. */
export function scooterDocumentVinReadings(
  analysis: v1.scooters.ScooterDocumentAnalysis,
) {
  const data = analysis.extractedData;
  const readings = data.documents?.length
    ? data.documents.map((document) => ({
        documentId: document.id,
        documentType: document.documentType,
        pages: document.pages,
        vin: document.vin,
        originalVin: document.vinReview
          ? document.vinReview.originalVin
          : document.vin,
      }))
    : [
        {
          documentId: undefined,
          documentType: analysis.documentType,
          pages: [] as number[],
          vin: data.vin,
          originalVin: data.vinReview ? data.vinReview.originalVin : data.vin,
        },
      ];
  return readings.filter((reading) =>
    v1.scooters.scooterDocumentReadsVin(reading.documentType),
  );
}

/** Called only for an operator's explicit correction after reviewing the document. */
export function reviewScooterDocumentVin(
  analysis: v1.scooters.ScooterDocumentAnalysis,
  value: string,
  documentId?: string,
): v1.scooters.ScooterDocumentAnalysis | null {
  const parsed =
    v1.scooters.scooterDocumentExtractedDataSchema.shape.vin.safeParse(value);
  if (!parsed.success || !parsed.data) return null;
  const vin = parsed.data;
  const data = analysis.extractedData;
  if (documentId !== undefined) {
    const target = data.documents?.find(
      (document) => document.id === documentId,
    );
    if (!target || !v1.scooters.scooterDocumentReadsVin(target.documentType))
      return null;
    const corrected = reviewScooterDocumentVin(
      {
        ...analysis,
        documentType: target.documentType,
        extractedData: target,
        issues: target.issues ?? [],
      },
      vin,
    );
    if (!corrected) return null;
    const documents = data.documents!.map((document) =>
      document.id === documentId
        ? { ...document, ...corrected.extractedData, issues: corrected.issues }
        : document,
    );
    const vins = new Set(
      documents
        .filter((document) =>
          v1.scooters.scooterDocumentReadsVin(document.documentType),
        )
        .map((document) => document.vin)
        .filter(Boolean),
    );
    const aggregateVin = vins.size === 1 ? [...vins][0]! : null;
    return {
      ...analysis,
      extractedData: {
        ...data,
        documents,
        vin: aggregateVin,
        fields: {
          ...data.fields,
          ...(Object.hasOwn(data.fields, "vin") ? { vin: aggregateVin } : {}),
          ...(Object.hasOwn(data.fields, "documentVin")
            ? { documentVin: aggregateVin }
            : {}),
        },
      },
    };
  }
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
