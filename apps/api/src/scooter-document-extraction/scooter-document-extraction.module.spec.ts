import type { Env } from "../config/env";
import { createScooterDocumentExtractionProvider } from "./scooter-document-extraction.module";
import { ScooterDocumentExtractionService } from "./scooter-document-extraction.service";

describe("scooter extraction provider selection", () => {
  it("leaves extraction disabled without a configured driver", async () => {
    const provider = createScooterDocumentExtractionProvider({} as Env);
    await expect(
      provider.analyze({
        documentType: "civ",
        bytes: Buffer.from("synthetic"),
        contentType: "image/png",
      }),
    ).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_DISABLED",
      retryable: false,
    });
  });

  it("requires server-side credentials and prevents production fake fixtures", () => {
    expect(() =>
      createScooterDocumentExtractionProvider({
        SCOOTER_DOCUMENT_EXTRACTION_DRIVER: "openai",
      } as Env),
    ).toThrow("API key");
    expect(() =>
      createScooterDocumentExtractionProvider({
        NODE_ENV: "production",
        SCOOTER_DOCUMENT_EXTRACTION_DRIVER: "fake",
      } as Env),
    ).toThrow("forbidden");
  });

  it.each([
    "civ",
    "registration_certificate",
    "import_document",
    "insurance",
  ] as const)(
    "returns explicitly synthetic review-required %s fixtures",
    async (documentType) => {
      const provider = createScooterDocumentExtractionProvider({
        NODE_ENV: "test",
        SCOOTER_DOCUMENT_EXTRACTION_DRIVER: "fake",
      } as Env);
      const result = await new ScooterDocumentExtractionService(
        provider,
      ).analyze({
        documentType,
        bytes: Buffer.from("synthetic"),
        contentType: "image/png",
      });
      expect(result.extractedData.vin).toBeNull();
      expect(Object.values(result.extractedData.fields)).toContain(
        "TEST FIXTURE",
      );
      expect(result.issues).toContainEqual({
        field: "vin",
        code: "unreadable",
      });
    },
  );
});
