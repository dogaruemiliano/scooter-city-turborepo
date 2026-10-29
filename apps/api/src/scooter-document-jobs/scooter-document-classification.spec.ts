import { v1 } from "@repo/api-shared";
import { Prisma, type ScooterDocumentJob } from "../generated/prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import type { ImageStorageService } from "../image-storage/image-storage.service";
import type { DocumentValidationService } from "../document-validation/document-validation.service";
import type { OpenAiScooterDocumentJobProvider } from "../scooter-document-extraction/openai-scooter-document-job.provider";
import { ScooterDocumentExtractionService } from "../scooter-document-extraction/scooter-document-extraction.service";
import type { Env } from "../config/env";
import { ScooterDocumentDispatcherService } from "./scooter-document-dispatcher.service";

const job = {
  id: "job",
  sessionId: "session",
  sourceId: "source",
  documentType: null,
  status: "running",
  cancellationAt: null,
} as ScooterDocumentJob;
function setup() {
  const tx = {
    $queryRaw: jest.fn(),
    scooterDocumentJob: {
      updateMany: jest
        .fn<
          Promise<{ count: number }>,
          [Prisma.ScooterDocumentJobUpdateManyArgs]
        >()
        .mockResolvedValue({ count: 1 }),
    },
    scooterDocumentResource: { updateMany: jest.fn() },
  };
  const prisma = {
    $transaction: (work: (value: typeof tx) => unknown) => work(tx),
  };
  const extraction = new ScooterDocumentExtractionService({
    analyze: jest.fn(),
  });
  return {
    tx,
    dispatcher: new ScooterDocumentDispatcherService(
      prisma as unknown as PrismaService,
      {} as ImageStorageService,
      {} as DocumentValidationService,
      {} as OpenAiScooterDocumentJobProvider,
      extraction,
      {} as Env,
    ),
  };
}

it.each(v1.scooters.SCOOTER_DOCUMENT_TYPES)(
  "completes an unclassified job as %s while preserving source identity",
  async (type) => {
    const { tx, dispatcher } = setup();
    await dispatcher.acceptProviderResult(job, {
      id: "resp_test",
      status: "completed",
      output: {
        detectedDocumentType: type,
        vin: "LXYTCKP05P0000001",
        fields: [],
        rawFields: [],
      },
    });
    const update = tx.scooterDocumentJob.updateMany.mock.calls[0][0];
    expect(update.data).toMatchObject({
      status: "completed",
      result: { sourceId: "source", documentType: type, reviewRequired: true },
    });
    expect(update.where).toMatchObject({
      id: "job",
      cancellationAt: null,
      providerResponseId: "resp_test",
    });
    expect(
      v1.scooters.scooterDocumentExtractionJobSchema.safeParse({
        id: "job",
        sourceId: "source",
        documentType: "unclassified",
        status: "completed",
        result: update.data.result,
        expiresAt: new Date().toISOString(),
      }).success,
    ).toBe(true);
    expect(tx.scooterDocumentResource.updateMany).toHaveBeenCalled();
  },
);

it("classifies unrecognized supporting attachments as other without inventing vehicle evidence", async () => {
  const { tx, dispatcher } = setup();
  await dispatcher.acceptProviderResult(job, {
    id: "resp_test",
    status: "completed",
    output: {
      detectedDocumentType: null,
      vin: null,
      fields: [],
      rawFields: [],
    },
  });
  expect(tx.scooterDocumentJob.updateMany.mock.calls[0][0].data).toMatchObject({
    status: "completed",
    result: { documentType: "other", extractedData: { vin: null, fields: {} } },
  });
});
