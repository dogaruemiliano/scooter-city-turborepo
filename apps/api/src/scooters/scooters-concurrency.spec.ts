import { ConflictException, NotFoundException } from "@nestjs/common";
import { ScootersService } from "./scooters.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { ScooterDocumentsService } from "./scooter-documents.service";
import type { CivVocabularyService } from "./civ-vocabulary.service";
import type { ScooterPhotosService } from "./scooter-photos.service";

describe("scooter editor concurrency", () => {
  const timestamp = "2026-10-29T10:00:00.000Z";
  function setup(lockedTimestamp = timestamp) {
    const scooter = {
      id: "scooter",
      powertrainType: "combustion",
      registrationType: "unregistered",
      requiredLicenseCategory: "none",
      // Legacy evidence must not impose removed manual configuration requirements.
      limiterKind: "LIMITED",
      limiterKmh: 45,
      maxSpeedSource: null,
      configurationEvidence: null,
      updatedAt: new Date(timestamp),
    };
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ updatedAt: new Date(lockedTimestamp) }]),
      scooter: { update: jest.fn().mockResolvedValue(scooter) },
    };
    const prisma = {
      scooter: { findFirst: jest.fn().mockResolvedValue(scooter) },
      $transaction: jest.fn((run: (tx: unknown) => unknown) => run(tx)),
    };
    const documents = {
      prepare: jest.fn().mockResolvedValue([]),
      apply: jest.fn(),
    };
    const vocabulary = { remember: jest.fn() };
    const service = new ScootersService(
      prisma as unknown as PrismaService,
      documents as unknown as ScooterDocumentsService,
      vocabulary as unknown as CivVocabularyService,
      {} as ScooterPhotosService,
    );
    return { service, tx, documents, vocabulary };
  }
  it("rejects a stale editor inside the parent lock before writing anything", async () => {
    const { service, tx, documents, vocabulary } = setup(
      "2026-10-29T10:01:00.000Z",
    );
    try {
      await service.update("scooter", {
        expectedUpdatedAt: timestamp,
        model: "AI model",
      });
      throw new Error("Expected a conflict");
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: "SCOOTER_UPDATE_CONFLICT",
      });
    }
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.scooter.update).not.toHaveBeenCalled();
    expect(documents.apply).not.toHaveBeenCalled();
    expect(vocabulary.remember).not.toHaveBeenCalled();
  });
  it("allows a matching editor timestamp and keeps legacy clients compatible", async () => {
    const { service, tx, documents } = setup();
    await service.update("scooter", {
      expectedUpdatedAt: timestamp,
      model: "AI model",
    });
    expect(tx.scooter.update).toHaveBeenCalledTimes(1);
    expect(documents.apply).toHaveBeenCalledTimes(1);
    tx.$queryRaw.mockClear();
    await service.update("scooter", { model: "Manual model" });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });
  it("does not revive a scooter removed before the lock was acquired", async () => {
    const { service, tx } = setup();
    tx.$queryRaw.mockResolvedValue([]);
    await expect(
      service.update("scooter", { expectedUpdatedAt: timestamp }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.scooter.update).not.toHaveBeenCalled();
  });
  it("preserves selected licence policy for unregistered scooters without rewriting physical evidence", async () => {
    const { service, tx } = setup();
    await service.update("scooter", { requiredLicenseCategory: "AM" });
    const call: unknown = tx.scooter.update.mock.calls[0];
    expect(call).toMatchObject([{ data: { requiredLicenseCategory: "AM" } }]);
    expect(call).not.toMatchObject([
      { data: { limiterKind: "LIMITED", limiterKmh: 25 } },
    ]);
  });
});
