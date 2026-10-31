import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { createCanvas } from "@napi-rs/canvas";
import { v1 } from "@repo/api-shared";
import type { Env } from "../config/env";
import type { ContractSupport } from "./contract-support";
import { TemplatesService } from "./templates.service";

function setup() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    mediaAsset: {
      create: jest
        .fn()
        .mockResolvedValue({ id: "logo", checksumSha256: "a".repeat(64) }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  const support = {
    require: jest.fn().mockResolvedValue({}),
    company: jest.fn().mockResolvedValue({ id: "company" }),
    event: jest.fn().mockResolvedValue(undefined),
    storage: {
      storeImage: jest.fn().mockResolvedValue({
        provider: "s3",
        bucket: "private",
        storageKey: "contract-branding/random.png",
        contentType: "image/png",
        byteSize: 100,
        checksumSha256: "a".repeat(64),
      }),
    },
    prisma: {
      ...tx,
      $transaction: (run: (client: typeof tx) => Promise<unknown>) => run(tx),
    },
  };
  return {
    service: new TemplatesService(
      support as unknown as ContractSupport,
      {} as Env,
    ),
    support,
    tx,
  };
}

describe("authorized company branding", () => {
  it("sanitizes a small rectangular raster and records company-specific provenance", async () => {
    const { service, support, tx } = setup();
    const canvas = createCanvas(120, 40);
    canvas.getContext("2d").fillRect(4, 4, 100, 20);
    const buffer = await canvas.encode("png");
    await expect(
      service.uploadLogo("operator", {
        mimetype: "image/png",
        buffer,
      } as Express.Multer.File),
    ).resolves.toEqual({ assetId: "logo" });
    expect(support.storage.storeImage).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: "image/png",
        category: "contract-branding",
        buffer: expect.any(Buffer) as Buffer,
      }),
    );
    expect(tx.mediaAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        uploadedByUserId: "operator",
        contractCompanyId: "company",
        contractPurpose: "branding",
      }) as Record<string, unknown>,
    });
  });
  it("rejects disguised image content before uploading", async () => {
    const { service, support } = setup();
    await expect(
      service.uploadLogo("operator", {
        mimetype: "image/png",
        buffer: Buffer.from("<svg>private</svg>"),
      } as Express.Multer.File),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(support.storage.storeImage).not.toHaveBeenCalled();
  });
  it("does not accept a private identity asset as a company logo", async () => {
    const { service, tx } = setup();
    await expect(
      service.saveSettings("operator", {
        logoAssetId: "identity-photo",
      } as v1.contracts.ContractSettings),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.mediaAsset.findFirst).toHaveBeenCalledWith({
      where: {
        id: "identity-photo",
        contractCompanyId: "company",
        contractPurpose: "branding",
        deletedAt: null,
        retentionPurgeItemId: null,
      },
    });
  });
  it("checks upload permission before decoding or storage", async () => {
    const { service, support } = setup();
    support.require.mockRejectedValue(new ForbiddenException());
    await expect(
      service.uploadLogo("operator", undefined),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(support.storage.storeImage).not.toHaveBeenCalled();
  });
});
