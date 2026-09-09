/**
 * Provider-neutral document extraction contracts.
 *
 * Finance and future person-document workflows depend on these shapes rather
 * than AWS SDK response types. Providers keep standardized expense fields,
 * line items, confidence, and OCR lines because later mapping stages need all
 * four, but storage keys and credentials never cross this boundary.
 */

export type ExpenseDocumentSource =
  | { kind: "bytes"; bytes: Uint8Array }
  | {
      kind: "s3";
      bucket: string;
      key: string;
      version?: string;
    };

export interface AnalyzeExpenseInput {
  source: ExpenseDocumentSource;
}

export interface ExtractionBoundingBox {
  width: number;
  height: number;
  left: number;
  top: number;
}

export interface ExtractionDetection {
  text?: string;
  confidence?: number;
  boundingBox?: ExtractionBoundingBox;
}

export interface ExpenseAnalysisField {
  type?: ExtractionDetection;
  label?: ExtractionDetection;
  value?: ExtractionDetection;
  pageNumber?: number;
  currency?: {
    code?: string;
    confidence?: number;
  };
  groups: Array<{ id?: string; types: string[] }>;
}

export interface ExpenseAnalysisLineItemGroup {
  index?: number;
  items: Array<{ fields: ExpenseAnalysisField[] }>;
}

export interface ExpenseAnalysisTextLine {
  text: string;
  confidence?: number;
  pageNumber?: number;
  boundingBox?: ExtractionBoundingBox;
}

export interface ExpenseAnalysisDocument {
  index?: number;
  summaryFields: ExpenseAnalysisField[];
  lineItemGroups: ExpenseAnalysisLineItemGroup[];
  /** LINE blocks only. WORD blocks are intentionally omitted as duplicates. */
  textLines: ExpenseAnalysisTextLine[];
}

export interface ExpenseAnalysisResult {
  provider: string;
  providerRequestId?: string;
  pages?: number;
  documents: ExpenseAnalysisDocument[];
}

export interface DocumentExtractionProvider {
  readonly name: string;
  analyzeExpense(input: AnalyzeExpenseInput): Promise<ExpenseAnalysisResult>;
}
