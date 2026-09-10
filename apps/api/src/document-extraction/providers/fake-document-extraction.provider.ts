import type {
  DocumentExtractionProvider,
  ExpenseAnalysisResult,
} from "../document-extraction.types";

/** Deterministic local/CI provider. It never reads or transmits the document. */
export class FakeDocumentExtractionProvider implements DocumentExtractionProvider {
  readonly name = "fake";

  analyzeExpense(): Promise<ExpenseAnalysisResult> {
    return Promise.resolve({
      provider: this.name,
      providerRequestId: "fake-request",
      pages: 1,
      documents: [
        {
          index: 1,
          summaryFields: [
            fakeField("VENDOR_NAME", "Example Supplier SRL"),
            fakeField("TOTAL", "123.45", "RON"),
            fakeField("INVOICE_RECEIPT_DATE", "2026-08-22"),
          ],
          lineItemGroups: [],
          textLines: [
            { text: "EXAMPLE SUPPLIER SRL", confidence: 99, pageNumber: 1 },
            { text: "TOTAL 123.45 RON", confidence: 99, pageNumber: 1 },
          ],
        },
      ],
    });
  }
}

function fakeField(
  type: string,
  value: string,
  currency?: string,
): ExpenseAnalysisResult["documents"][number]["summaryFields"][number] {
  return {
    type: { text: type, confidence: 99 },
    value: { text: value, confidence: 99 },
    ...(currency ? { currency: { code: currency, confidence: 99 } } : {}),
    groups: [],
  };
}
