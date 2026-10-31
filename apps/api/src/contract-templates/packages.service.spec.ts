import { NotFoundException } from "@nestjs/common";
import type { Env } from "../config/env";
import type { ContractSupport } from "./contract-support";
import { PackagesService } from "./packages.service";
import { assertPackageCurrent } from "./package-integrity";

jest.mock("./package-integrity", () => ({
  assertPackageCurrent: jest.fn(),
  packageSourceFingerprint: jest.fn(),
}));
jest.mock("./contract-data", () => ({
  packageSnapshotSchema: { parse: (value: unknown) => value },
  snapshotValues: jest.fn(),
  buildPackageSnapshot: jest.fn(),
}));

function setup() {
  const pkg = {
    id: "package",
    companyId: "company",
    rentalId: "rental",
    status: "rendered",
    manifestHash: "manifest",
    sourceFingerprint: "source",
    rentalRevision: 2,
    identityStatus: "submitted",
    selfieAssetId: "selfie",
    identityDocumentId: "identity",
    phoneVerifiedAt: new Date(),
    snapshot: { terms: { promotion: "standard" } },
    documents: [] as { id: string; presentedAssetId: string }[],
    renderLeaseUntil: null,
  };
  const tx = {
    rental: {
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ id: "rental", scooterId: "scooter" }),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    documentPackage: {
      findFirst: jest.fn().mockResolvedValue(pkg),
      findUniqueOrThrow: jest.fn().mockResolvedValue(pkg),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue(pkg),
    },
    mediaAsset: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "asset" }),
    },
    rentalDocument: { findFirst: jest.fn().mockResolvedValue(null) },
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
    read: jest.fn().mockResolvedValue(Buffer.from("PDF")),
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
    service: new PackagesService(
      support as unknown as ContractSupport,
      {} as Env,
    ),
    support,
    tx,
    pkg,
  };
}

describe("rental document packages", () => {
  beforeEach(() => jest.mocked(assertPackageCurrent).mockReset());
  it("keeps the unapproved contract workflow disabled", async () => {
    const { service, support } = setup();
    await expect(
      service.create("operator", "rental", {
        idempotencyKey: "key",
        updateToActiveSet: false,
      }),
    ).rejects.toThrow("disabled");
    expect(support.prisma.$transaction).not.toHaveBeenCalled();
  });
  it("scopes package access to the current company", async () => {
    const { service, support, tx } = setup();
    await service.get("operator", "package");
    expect(support.require).toHaveBeenCalledWith("operator", "documents.read");
    expect(tx.documentPackage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "package", companyId: "company" },
      }),
    );
  });
  it("does not expose a package from another company", async () => {
    const { service, tx } = setup();
    tx.documentPackage.findFirst.mockResolvedValue(null);
    await expect(
      service.get("operator", "other-package"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it("fails without a real configured renderer", async () => {
    const { service, pkg, tx } = setup();
    pkg.status = "draft";
    await expect(service.render("operator", "package", "key")).rejects.toThrow(
      "converter not configured",
    );
    expect(tx.documentPackage.updateMany).not.toHaveBeenCalled();
  });
  it("never regenerates a published or signed document package", async () => {
    const { service, pkg, tx } = setup();
    pkg.status = "published";
    service.env.CONTRACT_RENDERER_BINARY = "/approved/converter";
    await expect(service.render("operator", "package", "key")).rejects.toThrow(
      "Only a draft",
    );
    expect(tx.documentPackage.updateMany).not.toHaveBeenCalled();
  });
  it("rejects a second render when another worker holds the lease", async () => {
    const { service, pkg, tx } = setup();
    pkg.status = "draft";
    service.env.CONTRACT_RENDERER_BINARY = "/approved/converter";
    tx.documentPackage.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.render("operator", "package", "key")).rejects.toThrow(
      "already running",
    );
  });
  it("requires all three independent rendered documents before publication", async () => {
    const { service, tx } = setup();
    await expect(service.publish("operator", "package", "key")).rejects.toThrow(
      "complete package",
    );
    expect(tx.documentPackage.update).not.toHaveBeenCalled();
  });
  it("rejects stale rental/person/scooter sources before publication", async () => {
    const { service, tx } = setup();
    jest
      .mocked(assertPackageCurrent)
      .mockRejectedValueOnce(new Error("Revision required"));
    await expect(service.publish("operator", "package", "key")).rejects.toThrow(
      "Revision required",
    );
    expect(tx.documentPackage.update).not.toHaveBeenCalled();
  });
  it("verifies private document integrity before publication", async () => {
    const { service, support, tx, pkg } = setup();
    pkg.documents = [{ id: "document", presentedAssetId: "asset" }];
    support.read.mockRejectedValue(new Error("hash mismatch"));
    await expect(service.publish("operator", "package", "key")).rejects.toThrow(
      "hash mismatch",
    );
    expect(tx.documentPackage.update).not.toHaveBeenCalled();
  });
  it.each([
    {
      selfieAssetId: "different-selfie",
      identityDocumentId: "identity",
      approved: true,
      reason: "Identity compared manually",
    },
    {
      selfieAssetId: "selfie",
      identityDocumentId: "different-id",
      approved: true,
      reason: "Identity compared manually",
    },
  ])(
    "binds manual approval to the exact selfie and identity document",
    async (input) => {
      const { service, tx, pkg } = setup();
      pkg.status = "published";
      await expect(
        service.reviewIdentity("reviewer", "package", input),
      ).rejects.toThrow("exact submitted selfie");
      expect(tx.documentPackage.update).not.toHaveBeenCalled();
    },
  );
  it("does not approve a selfie without verified phone control", async () => {
    const { service, tx, pkg } = setup();
    pkg.status = "published";
    Object.assign(pkg, { phoneVerifiedAt: null });
    await expect(
      service.reviewIdentity("reviewer", "package", {
        selfieAssetId: "selfie",
        identityDocumentId: "identity",
        approved: true,
        reason: "Compared manually",
      }),
    ).rejects.toThrow("exact submitted selfie");
    expect(tx.documentPackage.update).not.toHaveBeenCalled();
  });
  it("does not reveal cross-company document IDs", async () => {
    const { service, tx } = setup();
    await expect(
      service.file("operator", "other-document", "presented"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.rentalDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "other-document", package: { companyId: "company" } },
      }),
    );
  });
});
