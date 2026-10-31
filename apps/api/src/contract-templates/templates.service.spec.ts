import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ForbiddenException } from "@nestjs/common";
import type { Env } from "../config/env";
import type { ContractSupport } from "./contract-support";
import { TemplatesService } from "./templates.service";
import * as converter from "./engine/pdf-converter";
import {
  REGISTRY_VERSION,
  RENDERER_VERSION,
  validateDocxTemplate,
} from "./engine/docx-engine";

const source = readFileSync(join(__dirname, "assets/gdpr-notice.docx"));
const report = validateDocxTemplate(source, "GDPR_NOTICE");
const scenarios = [
  "25",
  "45",
  "NO_LIMITER",
  "LONG_NAMES",
  "ABSENT_EQUIPMENT",
  "DEFECTS",
];
const makeVersion = () => ({
  id: "v1",
  status: "DRAFT",
  templateId: "t1",
  version: 1,
  sourceSha256: report.sourceSha256,
  sourceAsset: { id: "source" },
  schemaVersion: REGISTRY_VERSION,
  rendererVersion: RENDERER_VERSION,
  manifestHash: report.manifestHash,
  validationStatus: "PASSED",
  approvedBy: "reviewer",
  approvedAt: new Date(),
  template: {
    id: "t1",
    companyId: "company",
    type: "GDPR_NOTICE",
    locale: "ro",
  },
  previews: scenarios.map((scenario) => ({
    scenario,
    manifestHash: report.manifestHash,
    asset: { id: `preview-${scenario}` },
  })),
});
function setup() {
  const version = makeVersion();
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    contractPreview: {
      upsert: jest.fn((input: { update: { assetId: string } }) =>
        Promise.resolve(input),
      ),
    },
    contractTemplateVersion: {
      findFirst: jest.fn().mockResolvedValue(version),
      findUniqueOrThrow: jest.fn().mockResolvedValue(version),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue(version),
    },
    contractTemplate: {
      findFirst: jest.fn().mockResolvedValue(version.template),
    },
    contractSettings: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ companyId: "company", activeSetId: "old-set" }),
      update: jest.fn().mockResolvedValue({}),
    },
    templateSetVersion: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn(async (run: (value: typeof tx) => Promise<unknown>) =>
      run(tx),
    ),
  };
  const support = {
    prisma,
    require: jest.fn().mockResolvedValue({}),
    company: jest.fn().mockResolvedValue({ id: "company" }),
    read: jest.fn().mockResolvedValue(source),
    store: jest.fn(),
    event: jest.fn().mockResolvedValue(undefined),
    command: jest.fn(
      async (
        _tx: unknown,
        _key: string,
        _action: string,
        _id: string,
        _input: unknown,
        run: () => Promise<unknown>,
      ) => run(),
    ),
  };
  return {
    service: new TemplatesService(
      support as unknown as ContractSupport,
      {} as Env,
    ),
    support,
    tx,
    version,
  };
}

describe("contract template publication controls", () => {
  it("replaces stale draft preview references when validation is repeated", async () => {
    const { service, support, tx } = setup();
    service.env.CONTRACT_RENDERER_BINARY = "/approved/private/converter";
    let index = 0;
    support.store.mockImplementation(() =>
      Promise.resolve({
        id: `preview-${index++}`,
      }),
    );
    const conversion = jest
      .spyOn(converter, "convertDocxToPdf")
      .mockResolvedValue(Buffer.from("%PDF-synthetic-converter-test"));
    try {
      await service.validate("reviewer", "v1");
      await service.validate("reviewer", "v1");
      expect(tx.contractPreview.upsert).toHaveBeenCalledTimes(12);
      for (const [offset, call] of tx.contractPreview.upsert.mock.calls
        .slice(6)
        .entries()) {
        expect(call[0]).toEqual(
          expect.objectContaining({
            update: { assetId: `preview-${offset + 6}` },
          }),
        );
      }
      expect(tx.contractTemplateVersion.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            approvedBy: null,
            approvedAt: null,
          }) as Record<string, unknown>,
        }),
      );
    } finally {
      conversion.mockRestore();
    }
  });
  it("scopes source lookup to the company and requested permission", async () => {
    const { service, support, tx } = setup();
    await service.version("operator", "v1", "templates.publish");
    expect(support.require).toHaveBeenCalledWith(
      "operator",
      "templates.publish",
    );
    expect(tx.contractTemplateVersion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "v1", template: { companyId: "company" } },
      }),
    );
  });
  it("rejects unauthorized publication before source access", async () => {
    const { service, support } = setup();
    support.require.mockRejectedValue(new ForbiddenException());
    await expect(
      service.publish("operator", "v1", "key"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(support.read).not.toHaveBeenCalled();
  });
  it("rejects disguised uploads before storing an asset", async () => {
    const { service, support } = setup();
    await expect(
      service.upload("admin", "t1", {
        originalname: "contract.docx",
        buffer: Buffer.from("not Word"),
        size: 8,
      } as Express.Multer.File),
    ).rejects.toThrow();
    expect(support.store).not.toHaveBeenCalled();
  });
  it("requires an actual private PDF renderer for previews", async () => {
    const { service, tx } = setup();
    await expect(service.validate("admin", "v1")).rejects.toThrow(
      "CONTRACT_RENDERER_BINARY",
    );
    expect(tx.contractTemplateVersion.update).not.toHaveBeenCalled();
  });
  it("never validates an already published source", async () => {
    const { service, version, tx } = setup();
    version.status = "PUBLISHED";
    await expect(service.validate("admin", "v1")).rejects.toThrow("immutable");
    expect(tx.contractTemplateVersion.update).not.toHaveBeenCalled();
  });
  it("cannot clear approval on a version published during source verification", async () => {
    const { service, version, support, tx } = setup();
    service.env.CONTRACT_RENDERER_BINARY = "/approved/converter";
    support.read.mockImplementation(() => {
      version.status = "PUBLISHED";
      return Promise.resolve(source);
    });
    tx.contractTemplateVersion.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.validate("admin", "v1")).rejects.toThrow(
      "Template changed",
    );
    expect(tx.contractTemplateVersion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "v1",
          status: "DRAFT",
          sourceSha256: report.sourceSha256,
          validationStatus: { not: "RUNNING" },
        },
      }),
    );
    expect(tx.contractTemplateVersion.update).not.toHaveBeenCalled();
  });
  it("rejects stale manifests at approval", async () => {
    const { service, tx } = setup();
    await expect(
      service.approve("reviewer", "v1", {
        manifestHash: "0".repeat(64),
        reviewStatement: "Reviewed content and layout",
      }),
    ).rejects.toThrow("current successful previews");
    expect(tx.contractTemplateVersion.updateMany).not.toHaveBeenCalled();
  });
  it("requires all six current preview scenarios", async () => {
    const { service, version } = setup();
    version.previews.pop();
    await expect(
      service.approve("reviewer", "v1", {
        manifestHash: report.manifestHash,
        reviewStatement: "Reviewed content and layout",
      }),
    ).rejects.toThrow("current successful previews");
  });
  it("cannot publish without explicit approval", async () => {
    const { service, version, tx } = setup();
    version.approvedBy = "";
    await expect(service.publish("admin", "v1", "key")).rejects.toThrow(
      "explicit approval",
    );
    expect(tx.contractTemplateVersion.update).not.toHaveBeenCalled();
  });
  it("rechecks source manifest before publishing", async () => {
    const { service, version, tx } = setup();
    version.manifestHash = "0".repeat(64);
    await expect(service.publish("admin", "v1", "key")).rejects.toThrow(
      "Current successful validation",
    );
    expect(tx.contractTemplateVersion.update).not.toHaveBeenCalled();
  });
  it("verifies each private preview before publication", async () => {
    const { service, support, tx } = setup();
    support.read.mockImplementation((asset: { id: string }) => {
      if (asset.id === "preview-45") throw new Error("hash mismatch");
      return Promise.resolve(source);
    });
    await expect(service.publish("admin", "v1", "key")).rejects.toThrow(
      "hash mismatch",
    );
    expect(tx.contractTemplateVersion.update).not.toHaveBeenCalled();
  });
  it("publishes one reviewed version without changing the active set", async () => {
    const { service, support, tx } = setup();
    await service.publish("admin", "v1", "key");
    expect(tx.contractTemplateVersion.update).toHaveBeenCalledWith({
      where: { id: "v1" },
      data: {
        status: "PUBLISHED",
        publishedAt: expect.any(Date) as unknown,
      },
    });
    expect(support.event).toHaveBeenCalledWith(
      tx,
      "admin",
      "v1",
      "template.published",
      { manifestHash: report.manifestHash },
    );
    expect(tx.contractSettings.update).not.toHaveBeenCalled();
  });
  it("rejects activation if another administrator changed the active pointer", async () => {
    const { service, tx } = setup();
    tx.templateSetVersion.findFirst.mockResolvedValue({
      id: "new-set",
      agreementVersion: makeVersion(),
      gdprVersion: makeVersion(),
      technicalVersion: makeVersion(),
      promotionVersion: null,
    });
    await expect(
      service.activate("admin", "new-set", {
        expectedActiveSetId: "stale",
        idempotencyKey: "key",
        reason: "Activate reviewed set",
      }),
    ).rejects.toThrow("Active template set changed");
    expect(tx.contractSettings.update).not.toHaveBeenCalled();
  });
  it("cannot activate a set referencing archived versions", async () => {
    const { service, tx } = setup();
    const published = { ...makeVersion(), status: "PUBLISHED" };
    tx.templateSetVersion.findFirst.mockResolvedValue({
      id: "new-set",
      agreementVersion: published,
      gdprVersion: { ...published, status: "ARCHIVED" },
      technicalVersion: published,
      promotionVersion: null,
    });
    await expect(
      service.activate("admin", "new-set", {
        expectedActiveSetId: "old-set",
        idempotencyKey: "key",
        reason: "Activate reviewed set",
      }),
    ).rejects.toThrow("unavailable or incompatible");
    expect(tx.contractSettings.update).not.toHaveBeenCalled();
  });
});
