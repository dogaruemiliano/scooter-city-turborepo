import { DocumentExtractionError } from "../document-extraction.errors";
import type {
  DocumentExtractionProvider,
  ExpenseAnalysisResult,
} from "../document-extraction.types";

export class DisabledDocumentExtractionProvider implements DocumentExtractionProvider {
  readonly name = "disabled";

  analyzeExpense(): Promise<ExpenseAnalysisResult> {
    return Promise.reject(
      new DocumentExtractionError(
        "DOCUMENT_EXTRACTION_DISABLED",
        "Document extraction is disabled.",
        false,
      ),
    );
  }
}
