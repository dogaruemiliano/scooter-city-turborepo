import { Inject, Injectable } from "@nestjs/common";

import { DOCUMENT_EXTRACTION_PROVIDER } from "./document-extraction.constants";
import type {
  AnalyzeExpenseInput,
  DocumentExtractionProvider,
  ExpenseAnalysisResult,
} from "./document-extraction.types";

@Injectable()
export class DocumentExtractionService {
  constructor(
    @Inject(DOCUMENT_EXTRACTION_PROVIDER)
    private readonly provider: DocumentExtractionProvider,
  ) {}

  get providerName(): string {
    return this.provider.name;
  }

  analyzeExpense(input: AnalyzeExpenseInput): Promise<ExpenseAnalysisResult> {
    return this.provider.analyzeExpense(input);
  }
}
