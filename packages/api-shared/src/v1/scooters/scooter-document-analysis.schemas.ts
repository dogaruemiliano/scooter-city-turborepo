import { z } from "zod";
import { scooterDocumentTypeSchema } from "./scooter-documents.schemas";
import { scooterDocumentExtractedDataSchema } from "./scooter-document-extraction.schemas";

export const SCOOTER_DOCUMENT_EXTRACTION_MAX_PAGES = 10;
export const SCOOTER_DOCUMENT_EXTRACTION_CLIENT_CONCURRENCY = 2;

const identifier = z.string().min(1).max(120);

/** The API resolves private storage internally; callers never supply file URLs. */
export const analyzeScooterDocumentInputSchema = z
  .object({
    sourceId: identifier,
    source: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("draft"),
          type: scooterDocumentTypeSchema,
          uploadToken: z.string().min(1).max(8192),
        })
        .strict(),
      z
        .object({
          kind: z.literal("saved"),
          scooterId: identifier,
          documentId: identifier,
        })
        .strict(),
    ]),
  })
  .strict()
  .meta({ id: "AnalyzeScooterDocumentInput" });
export type AnalyzeScooterDocumentInput = z.infer<
  typeof analyzeScooterDocumentInputSchema
>;

export const SCOOTER_DOCUMENT_EXTRACTION_ISSUE_CODES = [
  "unreadable",
  "invalidValue",
  "conflictingValues",
  "typeMismatch",
  "noData",
] as const;
export const scooterDocumentExtractionIssueSchema = z
  .object({
    field: identifier,
    code: z.enum(SCOOTER_DOCUMENT_EXTRACTION_ISSUE_CODES),
  })
  .strict();
export type ScooterDocumentExtractionIssue = z.infer<
  typeof scooterDocumentExtractionIssueSchema
>;

/** One trusted source per response; a successful read never implies verification. */
export const scooterDocumentAnalysisSchema = z
  .object({
    sourceId: identifier,
    documentType: scooterDocumentTypeSchema,
    extractedData: scooterDocumentExtractedDataSchema,
    issues: z.array(scooterDocumentExtractionIssueSchema).max(200),
    reviewRequired: z.literal(true),
  })
  .strict()
  .meta({ id: "ScooterDocumentAnalysis" });
export type ScooterDocumentAnalysis = z.infer<
  typeof scooterDocumentAnalysisSchema
>;
