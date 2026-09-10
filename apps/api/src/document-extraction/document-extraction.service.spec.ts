import { DocumentExtractionService } from "./document-extraction.service";
import { DisabledDocumentExtractionProvider } from "./providers/disabled-document-extraction.provider";
import { FakeDocumentExtractionProvider } from "./providers/fake-document-extraction.provider";

describe("DocumentExtractionService", () => {
  it("delegates AnalyzeExpense to the configured provider", async () => {
    const service = new DocumentExtractionService(
      new FakeDocumentExtractionProvider(),
    );

    const result = await service.analyzeExpense({
      source: { kind: "bytes", bytes: new Uint8Array([1, 2, 3]) },
    });

    expect(service.providerName).toBe("fake");
    expect(result.provider).toBe("fake");
    expect(result.pages).toBe(1);
    const fields = result.documents[0]?.summaryFields ?? [];
    expect(fields.some((field) => field.type?.text === "VENDOR_NAME")).toBe(
      true,
    );
    expect(
      fields.some(
        (field) =>
          field.type?.text === "TOTAL" && field.currency?.code === "RON",
      ),
    ).toBe(true);
  });

  it("fails closed when extraction is disabled", async () => {
    const service = new DocumentExtractionService(
      new DisabledDocumentExtractionProvider(),
    );

    await expect(
      service.analyzeExpense({
        source: { kind: "bytes", bytes: new Uint8Array([1]) },
      }),
    ).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_DISABLED",
      retryable: false,
    });
  });
});
