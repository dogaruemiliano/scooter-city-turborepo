import { PrismaPg } from "@prisma/adapter-pg";
import { createHmac, randomBytes, randomInt, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { createCanvas } from "@napi-rs/canvas";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { v1 } from "@repo/api-shared";
import { PrismaClient } from "../generated/prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import type { AccessService } from "../access/access.service";
import type { ImageStorageService } from "../image-storage/image-storage.service";
import type { Logger } from "nestjs-pino";
import type { Env } from "../config/env";
import { AuditService } from "../audit/audit.service";
import { OtpDeliveryQuotaService } from "../auth/modules/otp-challenge/otp-delivery-quota.service";
import { assertDocumentPhotosMutable } from "../persons/person-document-contract-evidence";
import { prefillRentalInspection } from "../rentals/rental-inspection";
import { ContractSupport, digest, json } from "./contract-support";
import { packageSourceFingerprint } from "./package-integrity";
import { PackagesService } from "./packages.service";
import { SigningService } from "./signing.service";
import { buildPackageSnapshot, packageSnapshotSchema } from "./contract-data";
import { ContractRetentionService } from "./retention.service";

const databaseUrl = process.env.TEST_CONTRACT_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("signing transactions against isolated PostgreSQL", () => {
  let prisma: PrismaClient,
    support: ContractSupport,
    packages: PackagesService,
    signing: SigningService;
  let userId: string,
    personId: string,
    identityId: string,
    brandId: string,
    scooterId: string,
    bookId: string,
    companyId: string,
    setId: string;
  let reviewerId: string, retention: ContractRetentionService;
  const prefix = `signing-integration-${randomUUID()}`;
  const secret = randomBytes(32).toString("hex");
  const phone = `+40${randomInt(100_000_000, 999_999_999)}`;
  const keys: string[] = [],
    packageIds: string[] = [],
    rentalIds: string[] = [],
    templateIds: string[] = [];
  const bytes = new Map<string, Buffer>();
  const purge = jest
    .fn<Promise<void>, [{ storageKey: string }]>()
    .mockImplementation((source) => {
      bytes.delete(source.storageKey);
      return Promise.resolve();
    });
  const sms = {
    send: jest
      .fn<Promise<void>, [{ to: string; body: string }]>()
      .mockResolvedValue(undefined),
  };
  const mailer = { send: jest.fn(() => Promise.resolve(undefined)) };
  const env = {
    NODE_ENV: "test",
    APP_BASE_URL: "http://localhost:3001",
    API_BASE_URL: "http://localhost:3000",
    CORS_ORIGINS: [],
    SMS_PROVIDER: "smso",
    OTP_HMAC_SECRET: secret,
    OTP_DELIVERY_QUOTA_PER_TARGET_PER_HOUR: 10000,
    OTP_DELIVERY_QUOTA_PER_TARGET_PER_DAY: 10000,
    OTP_DELIVERY_QUOTA_PER_IP_PER_HOUR: 10000,
    CONTRACT_WORKFLOW_ENABLED: true,
    CONTRACT_FINAL_OTP_ENABLED: false,
    CONTRACT_INVITATION_TTL_SECONDS: 86400,
    CONTRACT_SESSION_TTL_SECONDS: 7200,
    CONTRACT_SESSION_IDLE_SECONDS: 1800,
    CONTRACT_OTP_TTL_SECONDS: 300,
    CONTRACT_OTP_MAX_ATTEMPTS: 5,
    CONTRACT_OTP_MAX_SENDS: 10,
    CONTRACT_OTP_RESEND_SECONDS: 60,
  } as unknown as Env;
  const settings = () => ({
    brandName: "Synthetic Scooter City",
    gpsHistoryStatement: "Synthetic approved GPS statement",
    registryNumber: "TEST/REGISTRY",
    address: "Synthetic test address",
    city: "București",
    county: "București",
    phone,
    email: `${prefix}@example.invalid`,
    iban: "RO00TEST0000000000000000",
    bank: "Test bank",
    representativeUserId: userId,
    representativeCapacity: "Synthetic representative",
    selfieNotice:
      "Synthetic processing notice covering purpose, legal basis, access, retention and rights.",
    selfieNoticeVersion: "test-v1",
    signingAcceptanceText:
      "Synthetic acceptance used only by these automated tests.",
    privacyRetentionDays: 30,
    contractRetentionDays: 3650,
    legalReviewStatement: "Synthetic configuration for automated tests only.",
  });

  beforeAll(async () => {
    const parsed = new URL(databaseUrl!);
    if (
      !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) ||
      !parsed.pathname.includes("test")
    )
      throw new Error("Use an explicitly named local test database");
    prisma = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: databaseUrl!,
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
      }),
    });
    await prisma.$connect();
    if (await prisma.financeBook.findUnique({ where: { type: "COMPANY" } }))
      throw new Error(
        "Use a fresh isolated test database; existing company data is never modified",
      );
    const user = await prisma.user.create({
      data: {
        email: `${prefix}-operator@example.invalid`,
        firstName: "Test",
        lastName: "Representative",
        loginStatus: "ACTIVE",
      },
    });
    userId = user.id;
    reviewerId = (
      await prisma.user.create({
        data: {
          email: `${prefix}-reviewer@example.invalid`,
          firstName: "Synthetic",
          lastName: "Reviewer",
          loginStatus: "ACTIVE",
        },
      })
    ).id;
    const person = await prisma.person.create({
      data: {
        userId,
        email: `${prefix}-person@example.invalid`,
        phone,
        firstName: "Test",
        lastName: "Customer",
        dateOfBirth: new Date("1990-01-01"),
      },
    });
    personId = person.id;
    identityId = (
      await prisma.personDocument.create({
        data: {
          personId,
          type: "nationalId",
          status: "verified",
          number: "TESTONLY",
          expiresOn: new Date("2030-12-31"),
        },
      })
    ).id;
    brandId = (
      await prisma.scooterBrand.create({
        data: { name: prefix, code: `T${randomUUID()}` },
      })
    ).id;
    scooterId = (
      await prisma.scooter.create({
        data: {
          fleetNumber: randomInt(100_000_000, 2_000_000_000),
          vin: randomUUID().replaceAll("-", "").slice(0, 17),
          brandId,
          powertrainType: "electric",
          commercialCategory: "without_license",
          limiterKind: "LIMITED",
          maxSpeedKmh: 45,
          limiterKmh: 25,
          maxSpeedSource: "Synthetic CIV",
          configurationEvidence: "Synthetic inspection",
          hasPhoneStand: false,
          hasChargingOutlet: false,
        },
      })
    ).id;
    bookId = (
      await prisma.financeBook.create({
        data: { name: prefix, type: "COMPANY" },
      })
    ).id;
    companyId = (
      await prisma.financeLegalIdentity.create({
        data: {
          bookId,
          legalName: prefix,
          normalizedLegalName: prefix,
          taxIdentifier: prefix,
          normalizedTaxIdentifier: prefix,
        },
      })
    ).id;
    const storage = {
      purgeRetainedDocument: purge,
      storeDocument: (input: { buffer: Buffer; contentType: string }) => {
        const storageKey = `${prefix}/${randomUUID()}`;
        bytes.set(storageKey, input.buffer);
        return Promise.resolve({
          provider: "s3",
          bucket: "synthetic-test-only",
          storageKey,
          contentType: input.contentType,
          byteSize: input.buffer.length,
          checksumSha256: digest(input.buffer),
        });
      },
      readDocument: (key: string) => {
        const buffer = bytes.get(key);
        if (!buffer) throw new Error("Missing synthetic object");
        return Promise.resolve({
          body: Readable.from(buffer),
          contentLength: buffer.length,
          contentType: null,
        });
      },
    } as unknown as ImageStorageService;
    const access = {
      getSnapshot: jest.fn(() =>
        Promise.resolve({
          isSuperAdmin: true,
          effectiveScopes: {},
        }),
      ),
    } as unknown as AccessService;
    support = new ContractSupport(
      prisma as unknown as PrismaService,
      access,
      storage,
      new AuditService(
        prisma as unknown as PrismaService,
        { error: jest.fn() } as unknown as Logger,
      ),
    );
    packages = new PackagesService(support, env);
    retention = new ContractRetentionService(support);
    jest.spyOn(packages, "finalize").mockResolvedValue(undefined); // Raster/PDF conversion is covered by the separate renderer tests.
    signing = new SigningService(
      support,
      packages,
      sms,
      mailer,
      new OtpDeliveryQuotaService(env),
      env,
    );
    const versions: string[] = [];
    for (const type of v1.contracts.documentOrder) {
      const asset = await support.store(
        Buffer.from("synthetic-source"),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        userId,
      );
      const template = await prisma.contractTemplate.create({
        data: { companyId, name: type, type, locale: "ro", createdBy: userId },
      });
      templateIds.push(template.id);
      versions.push(
        (
          await prisma.contractTemplateVersion.create({
            data: {
              templateId: template.id,
              version: 1,
              sourceAssetId: asset.id,
              sourceSha256: asset.checksumSha256,
              rendererVersion: "test-only",
              schemaVersion: "test-only",
              createdBy: userId,
              status: "PUBLISHED",
            },
          })
        ).id,
      );
    }
    setId = (
      await prisma.templateSetVersion.create({
        data: {
          companyId,
          name: prefix,
          locale: "ro",
          version: 1,
          agreementVersionId: versions[0],
          gdprVersionId: versions[1],
          technicalVersionId: versions[2],
          manifestHash: digest("synthetic set"),
          createdBy: userId,
        },
      })
    ).id;
  }, 30_000);

  afterAll(async () => {
    if (!prisma) return;
    try {
      await prisma.contractRetentionItem.deleteMany({
        where: { batch: { companyId } },
      });
      await prisma.contractRetentionBatch.deleteMany({ where: { companyId } });
      await prisma.contractLegalHold.deleteMany({ where: { companyId } });
      await prisma.contractRetentionPolicy.deleteMany({ where: { companyId } });
      await prisma.documentSignature.deleteMany({
        where: { document: { packageId: { in: packageIds } } },
      });
      await prisma.rentalSigningSession.deleteMany({
        where: { packageId: { in: packageIds } },
      });
      await prisma.signingInvitation.deleteMany({
        where: { packageId: { in: packageIds } },
      });
      await prisma.rentalDocument.deleteMany({
        where: { packageId: { in: packageIds } },
      });
      await prisma.documentPackage.deleteMany({
        where: { id: { in: packageIds } },
      });
      await prisma.scooterPhoto.deleteMany({
        where: { rentalId: { in: rentalIds } },
      });
      await prisma.rentalPayment.deleteMany({
        where: { rentalId: { in: rentalIds } },
      });
      await prisma.rental.deleteMany({ where: { id: { in: rentalIds } } });
      await prisma.contractCommand.deleteMany({ where: { key: { in: keys } } });
      if (companyId)
        await prisma.templateSetVersion.deleteMany({ where: { companyId } });
      await prisma.contractTemplateVersion.deleteMany({
        where: { templateId: { in: templateIds } },
      });
      await prisma.contractTemplate.deleteMany({
        where: { id: { in: templateIds } },
      });
      if (scooterId) await prisma.scooter.delete({ where: { id: scooterId } });
      if (brandId) await prisma.scooterBrand.delete({ where: { id: brandId } });
      if (identityId)
        await prisma.personDocument.delete({ where: { id: identityId } });
      if (personId) await prisma.person.delete({ where: { id: personId } });
      if (companyId)
        await prisma.financeLegalIdentity.delete({ where: { id: companyId } });
      if (bookId) await prisma.financeBook.delete({ where: { id: bookId } });
      await prisma.auditEvent.deleteMany({
        where: {
          OR: [
            { userId: { in: [userId, reviewerId] } },
            { targetId: { in: packageIds } },
          ],
        },
      });
      await prisma.mediaAsset.deleteMany({
        where: { storageKey: { startsWith: prefix } },
      });
      if (userId) await prisma.user.delete({ where: { id: userId } });
      if (reviewerId) await prisma.user.delete({ where: { id: reviewerId } });
      const quotaHashes = ["rental-signing:", "rental-signing-verify:"].map(
        (scope) =>
          createHmac("sha256", secret)
            .update(`otp-delivery-quota:v1:target:${scope}${phone}`)
            .digest("hex"),
      );
      quotaHashes.push(
        createHmac("sha256", secret)
          .update("otp-delivery-quota:v1:ip:127.0.0.1")
          .digest("hex"),
      );
      await prisma.otpDeliveryQuota.deleteMany({
        where: { subjectHash: { in: quotaHashes } },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  async function newPackage() {
    const scooter = await prisma.scooter.findUniqueOrThrow({
      where: { id: scooterId },
    });
    const rental = await prisma.rental.create({
      data: {
        personId,
        scooterId,
        createdByUserId: userId,
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 86400_000),
        workflowVersion: 1,
      },
    });
    rentalIds.push(rental.id);
    const snapshot = packageSnapshotSchema.parse({
      schemaVersion: 1,
      finalOtpRequired: false,
      contractNumber: `TEST-${rental.id}`,
      createdAt: new Date().toISOString(),
      personId,
      personName: "Test Customer",
      phone,
      email: `${prefix}-person@example.invalid`,
      companyId,
      companyName: prefix,
      companySettings: settings(),
      identityDocumentId: identityId,
      representativeName: "Test Representative",
      terms: v1.rentals.calculateRentalTerms("without_license"),
      inspection: prefillRentalInspection(scooter),
      limiterKind: "LIMITED",
      limiterKmh: 25,
      maxSpeedKmh: 45,
      logoAssetId: null,
      display: {
        speedDeclaration: "Synthetic approved limiter declaration of 25 km/h.",
      },
    });
    const fingerprint = await prisma.$transaction((tx) =>
      packageSourceFingerprint(tx, rental.id, identityId),
    );
    const pkg = await prisma.documentPackage.create({
      data: {
        companyId,
        rentalId: rental.id,
        revision: 1,
        rentalRevision: 1,
        templateSetVersionId: setId,
        status: "published",
        snapshot: json(snapshot),
        sourceFingerprint: fingerprint,
        subjectHash: digest(JSON.stringify(snapshot)),
        manifestHash: digest(rental.id),
        identityDocumentId: identityId,
        identityStatus: "approved",
        identityApprovedAt: new Date(),
        createdBy: userId,
      },
    });
    packageIds.push(pkg.id);
    const set = await prisma.templateSetVersion.findUniqueOrThrow({
      where: { id: setId },
    });
    for (const [index, type] of v1.contracts.documentOrder.entries()) {
      const asset = await support.store(
        Buffer.from(`synthetic PDF ${pkg.id} ${type}`),
        "application/pdf",
        userId,
      );
      await prisma.rentalDocument.create({
        data: {
          packageId: pkg.id,
          type,
          templateVersionId: [
            set.agreementVersionId,
            set.gdprVersionId,
            set.technicalVersionId,
          ][index],
          contentHash: asset.checksumSha256,
          presentedAssetId: asset.id,
          requiresLimiterSignature: type === "TECHNICAL_HANDOVER",
        },
      });
    }
    return pkg;
  }
  async function newSession(
    pkg: Awaited<ReturnType<typeof newPackage>>,
    verified = false,
  ) {
    const token = randomBytes(32).toString("base64url");
    const row = await prisma.rentalSigningSession.create({
      data: {
        packageId: pkg.id,
        tokenHash: digest(token),
        phone,
        expiresAt: new Date(Date.now() + 3600_000),
        phoneVerifiedAt: verified ? new Date() : null,
      },
    });
    if (verified)
      await prisma.documentPackage.update({
        where: { id: pkg.id },
        data: { phoneVerifiedAt: new Date() },
      });
    return { row, token };
  }
  const context = { ip: "127.0.0.1" };
  function signature() {
    const canvas = createCanvas(200, 100),
      ctx = canvas.getContext("2d");
    ctx.strokeStyle = "black";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(10, 60);
    ctx.lineTo(70, 20);
    ctx.lineTo(130, 80);
    ctx.lineTo(180, 40);
    ctx.stroke();
    return canvas.toDataURL("image/png");
  }

  it("delivers an idempotent invitation once and allows only one concurrent token exchange", async () => {
    const pkg = await newPackage(),
      idempotencyKey = randomUUID();
    keys.push(idempotencyKey);
    sms.send.mockClear();
    await signing.invite(userId, pkg.id, { idempotencyKey, channel: "sms" });
    await signing.invite(userId, pkg.id, { idempotencyKey, channel: "sms" });
    expect(sms.send).toHaveBeenCalledTimes(1);
    const token = /#token=([A-Za-z0-9_-]+)/.exec(
      sms.send.mock.calls[0][0].body,
    )![1];
    const invitation = await prisma.signingInvitation.findFirstOrThrow({
      where: { packageId: pkg.id },
    });
    expect(invitation.tokenHash).toBe(digest(token));
    expect(invitation.id).not.toBe(token);
    const result = await Promise.allSettled([
      signing.exchange(token, context),
      signing.exchange(token, context),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await prisma.rentalSigningSession.count({ where: { packageId: pkg.id } }),
    ).toBe(1);
  });

  it("atomically consumes one SMS proof under concurrent verification", async () => {
    const pkg = await newPackage(),
      { token, row } = await newSession(pkg);
    sms.send.mockClear();
    await signing.requestOtp(token, "phone", context);
    const code = /\b\d{6}\b/.exec(sms.send.mock.calls[0][0].body)![0];
    const outcomes = await Promise.allSettled([
      signing.verifyOtp(token, "phone", code, context),
      signing.verifyOtp(token, "phone", code, context),
    ]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const current = await prisma.rentalSigningSession.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(current.otpHash).toBeNull();
    expect(current.phoneVerifiedAt).not.toBeNull();
    expect(current.otpAttempts).toBe(1);
  });

  it("keeps failed verification attempts committed and does not reset them on resend", async () => {
    const pkg = await newPackage(),
      { token, row } = await newSession(pkg);
    await signing.requestOtp(token, "phone", context);
    await expect(
      signing.verifyOtp(token, "phone", "not-a-code", context),
    ).rejects.toThrow("Incorrect");
    await prisma.rentalSigningSession.update({
      where: { id: row.id },
      data: { otpSentAt: new Date(Date.now() - 61_000) },
    });
    await signing.requestOtp(token, "phone", context);
    expect(
      (
        await prisma.rentalSigningSession.findUniqueOrThrow({
          where: { id: row.id },
        })
      ).otpAttempts,
    ).toBe(1);
  });

  it("records exactly one customer act when identical sign requests race", async () => {
    const pkg = await newPackage(),
      { token } = await newSession(pkg, true);
    const document = await prisma.rentalDocument.findFirstOrThrow({
      where: { packageId: pkg.id, type: "RENTAL_AGREEMENT" },
    });
    const input = {
      contentHash: document.contentHash,
      signaturePng: signature(),
      acceptance: true as const,
    };
    await Promise.all([
      signing.sign(token, document.id, input, false, context),
      signing.sign(token, document.id, input, false, context),
    ]);
    expect(
      await prisma.documentSignature.count({
        where: { documentId: document.id, role: "customer" },
      }),
    ).toBe(1);
  });

  it("preserves referenced identity photographs from ordinary deletion or replacement", async () => {
    await newPackage();
    await expect(
      prisma.$transaction((tx) => assertDocumentPhotosMutable(tx, identityId)),
    ).rejects.toThrow("must be preserved");
  });
  it("rejects NULL constructive speed for a documented known limiter at the database boundary", async () => {
    await expect(
      prisma.scooter.update({
        where: { id: scooterId },
        data: { maxSpeedKmh: null },
      }),
    ).rejects.toThrow();
    expect(
      (await prisma.scooter.findUniqueOrThrow({ where: { id: scooterId } }))
        .maxSpeedKmh,
    ).toBe(45);
  });
  it("exports actual presented bytes, exact template sources and the evidence manifest in an authorized ZIP", async () => {
    const pkg = await newPackage();
    const directory = mkdtempSync(join(tmpdir(), "contract-evidence-test-"));
    let contents: {
      hashes: Record<string, string>;
      manifest: { package: { id: string } };
    };
    try {
      const path = join(directory, "evidence.zip");
      writeFileSync(path, await packages.evidenceArchive(userId, pkg.id));
      contents = JSON.parse(
        execFileSync(
          "python3",
          [
            "-c",
            "import hashlib,json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({'hashes':{n:hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist()},'manifest':json.loads(z.read('evidence.json'))}))",
            path,
          ],
          { encoding: "utf8" },
        ),
      ) as typeof contents;
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
    const documents = await prisma.rentalDocument.findMany({
      where: { packageId: pkg.id },
    });
    for (const document of documents) {
      expect(contents.hashes[`documents/presented/${document.id}.pdf`]).toBe(
        document.contentHash,
      );
      expect(
        contents.hashes[`templates/${document.templateVersionId}.docx`],
      ).toBeDefined();
    }
    expect(contents.manifest.package.id).toBe(pkg.id);
  });

  async function closeForRetention(
    pkg: Awaited<ReturnType<typeof newPackage>>,
  ) {
    await prisma.rental.update({
      where: { id: pkg.rentalId },
      data: {
        status: "returned",
        returnedAt: new Date(Date.now() - 30 * 86400_000),
      },
    });
    return pkg;
  }
  async function approvedPolicy(category: v1.contracts.RetentionCategory) {
    const policy = await retention.createPolicy(userId, {
      category,
      daysAfterRentalClosed: 1,
      legalBasis:
        "Synthetic approved legal basis for isolated retention tests only.",
    });
    await expect(
      retention.approvePolicy(
        userId,
        policy.id,
        "I approve this synthetic retention policy.",
      ),
    ).rejects.toThrow("different");
    return retention.approvePolicy(
      reviewerId,
      policy.id,
      "Independently approved synthetic test retention policy only.",
    );
  }
  async function retainedSelfie() {
    const pkg = await closeForRetention(await newPackage());
    const asset = await support.store(
      Buffer.from("Synthetic private selfie bytes; not a real person."),
      "image/png",
      userId,
    );
    await prisma.documentPackage.update({
      where: { id: pkg.id },
      data: { selfieAssetId: asset.id },
    });
    return { pkg, asset };
  }
  async function approvedPreview(
    packageId: string,
    category: v1.contracts.RetentionCategory,
  ) {
    const preview = await retention.preview(userId, {
      packageIds: [packageId],
      categories: [category],
    });
    expect(preview.manifest.blockers).toEqual([]);
    expect(preview.manifest.items.flatMap((item) => item.blockers)).toEqual([]);
    await expect(
      retention.approve(userId, preview.id, {
        manifestHash: preview.manifestHash,
        statement: "I approve deletion of this exact test manifest.",
      }),
    ).rejects.toThrow("different");
    await retention.approve(reviewerId, preview.id, {
      manifestHash: preview.manifestHash,
      statement:
        "Independently approve deletion of this exact synthetic test manifest.",
    });
    return preview;
  }
  it("requires explicit independently approved category policies before any purge preview is executable", async () => {
    const pkg = await closeForRetention(await newPackage());
    const preview = await retention.preview(userId, {
      packageIds: [pkg.id],
      categories: ["selfie"],
    });
    expect(preview.manifest.blockers).toContain(
      "policy.selfie.approval_required",
    );
    await expect(
      retention.approve(reviewerId, preview.id, {
        manifestHash: preview.manifestHash,
        statement: "Attempt to approve an incomplete test preview.",
      }),
    ).rejects.toThrow("blocker");
    expect(purge).not.toHaveBeenCalled();
    await approvedPolicy("selfie");
  });
  it("blocks a legal hold at preview and rechecks a newly placed hold after approval", async () => {
    const { pkg, asset } = await retainedSelfie();
    const hold = await retention.hold(userId, {
      packageId: pkg.id,
      reason: "Synthetic evidence preservation request.",
      legalBasis:
        "Synthetic litigation hold basis for this isolated test only.",
    });
    const heldPreview = await retention.preview(userId, {
      packageIds: [pkg.id],
      categories: ["selfie"],
    });
    expect(
      heldPreview.manifest.items.some((item) =>
        item.blockers.includes("legal_hold"),
      ),
    ).toBe(true);
    await retention.releaseHold(
      reviewerId,
      hold.id,
      "Synthetic hold released after an independently documented test review.",
    );
    const preview = await approvedPreview(pkg.id, "selfie");
    const lateHold = await retention.hold(userId, {
      packageId: pkg.id,
      reason: "A later synthetic evidence hold.",
      legalBasis: "A later independently recorded synthetic legal basis.",
    });
    const blocked = await retention.execute(
      reviewerId,
      preview.id,
      preview.manifestHash,
    );
    expect(blocked.status).toBe("partial");
    expect(
      (await prisma.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } }))
        .deletedAt,
    ).toBeNull();
    expect(bytes.has(asset.storageKey)).toBe(true);
    await retention.releaseHold(
      reviewerId,
      lateHold.id,
      "The later synthetic hold was reviewed and released explicitly.",
    );
    const result = await retention.execute(
      reviewerId,
      preview.id,
      preview.manifestHash,
    );
    expect(result.status).toBe("completed");
    expect(bytes.has(asset.storageKey)).toBe(false);
    const tombstone = await prisma.mediaAsset.findUniqueOrThrow({
      where: { id: asset.id },
    });
    expect(tombstone.retentionPurgedAt).not.toBeNull();
    expect(tombstone.checksumSha256).toBe(asset.checksumSha256);
  });
  it("keeps a durable fence on storage failure and retries deletion before final metadata accounting", async () => {
    const { pkg, asset } = await retainedSelfie();
    const preview = await approvedPreview(pkg.id, "selfie");
    purge.mockRejectedValueOnce(
      new Error("Synthetic provider timeout with uncertain outcome"),
    );
    const failed = await retention.execute(
      reviewerId,
      preview.id,
      preview.manifestHash,
    );
    expect(failed.status).toBe("partial");
    const fenced = await prisma.mediaAsset.findUniqueOrThrow({
      where: { id: asset.id },
    });
    expect(fenced.deletedAt).not.toBeNull();
    expect(fenced.retentionPurgedAt).toBeNull();
    expect(bytes.has(asset.storageKey)).toBe(true);
    await expect(
      retention.hold(userId, {
        packageId: pkg.id,
        reason: "A hold during uncertain deletion.",
        legalBasis:
          "Synthetic legal hold request while deletion is unresolved.",
      }),
    ).rejects.toThrow("uncertain");
    const retried = await retention.execute(
      reviewerId,
      preview.id,
      preview.manifestHash,
    );
    expect(retried.status).toBe("completed");
    expect(bytes.has(asset.storageKey)).toBe(false);
    expect(
      retried.items.find((item) => item.subjectType === "asset")?.attempts,
    ).toBe(2);
  });
  it("protects current identity photographs and outside-batch asset references", async () => {
    await approvedPolicy("identity");
    const pkg = await closeForRetention(await newPackage());
    const asset = await support.store(
      Buffer.from("Synthetic identity photo"),
      "image/png",
      userId,
    );
    const photo = await prisma.personDocumentPhoto.create({
      data: { personDocumentId: identityId, assetId: asset.id, slot: "front" },
    });
    const snapshot = packageSnapshotSchema.parse(pkg.snapshot);
    snapshot.identityPhotos = [
      {
        photoId: photo.id,
        assetId: asset.id,
        sha256: asset.checksumSha256,
        slot: "front",
      },
    ];
    await prisma.documentPackage.update({
      where: { id: pkg.id },
      data: { snapshot: json(snapshot) },
    });
    const preview = await retention.preview(userId, {
      packageIds: [pkg.id],
      categories: ["identity"],
    });
    expect(
      preview.manifest.items.find((item) => item.targetId === asset.id)
        ?.blockers,
    ).toContain("referenced_live_or_outside_batch");
    const first = await retainedSelfie(),
      other = await closeForRetention(await newPackage());
    await prisma.documentPackage.update({
      where: { id: other.id },
      data: { selfieAssetId: first.asset.id },
    });
    const shared = await retention.preview(userId, {
      packageIds: [first.pkg.id],
      categories: ["selfie"],
    });
    expect(
      shared.manifest.items.find((item) => item.targetId === first.asset.id)
        ?.blockers,
    ).toContain("referenced_live_or_outside_batch");
  });
  it("never approves a live rental or an unelapsed retention period", async () => {
    const live = await newPackage();
    const preview = await retention.preview(userId, {
      packageIds: [live.id],
      categories: ["selfie"],
    });
    expect(preview.manifest.blockers).toContain(
      `package.${live.id}.rental_not_closed`,
    );
    await prisma.rental.update({
      where: { id: live.rentalId },
      data: { status: "returned", returnedAt: new Date() },
    });
    const early = await retention.preview(userId, {
      packageIds: [live.id],
      categories: ["selfie"],
    });
    expect(
      early.manifest.items.some((item) =>
        item.blockers.includes("retention_period_not_elapsed"),
      ),
    ).toBe(true);
  });
  it("preserves immutable document/manifest digests and accounting rows after an approved contract purge", async () => {
    await approvedPolicy("contract");
    const pkg = await closeForRetention(await newPackage());
    const receipt = await prisma.rentalPayment.create({
      data: {
        rentalId: pkg.rentalId,
        idempotencyKey: randomUUID(),
        purpose: "rent",
        method: "cash",
        amountMinor: 30000,
        receivedAt: new Date(),
        confirmedByUserId: userId,
        evidenceReference: "Synthetic retained accounting receipt",
      },
    });
    const before = await prisma.rentalDocument.findMany({
      where: { packageId: pkg.id },
    });
    const preview = await approvedPreview(pkg.id, "contract");
    const result = await retention.execute(
      reviewerId,
      preview.id,
      preview.manifestHash,
    );
    expect(result.status).toBe("completed");
    const retained = await prisma.documentPackage.findUniqueOrThrow({
      where: { id: pkg.id },
    });
    expect(retained.subjectHash).toBe(pkg.subjectHash);
    expect(retained.manifestHash).toBe(pkg.manifestHash);
    expect(retained.status).toBe("retention_purged");
    expect((retained.snapshot as { schemaVersion: string }).schemaVersion).toBe(
      "retention-tombstone-v1",
    );
    expect(
      await prisma.rentalPayment.findUnique({ where: { id: receipt.id } }),
    ).toMatchObject({ amountMinor: 30000 });
    const after = await prisma.rentalDocument.findMany({
      where: { packageId: pkg.id },
    });
    expect(after.map((d) => d.contentHash)).toEqual(
      before.map((d) => d.contentHash),
    );
  });
  it("does not let a competing executor clear a live deletion lease or falsely accept a hold", async () => {
    const { pkg, asset } = await retainedSelfie(),
      preview = await approvedPreview(pkg.id, "selfie");
    let release!: () => void, started!: () => void;
    const waiting = new Promise<void>((resolve) => {
        release = resolve;
      }),
      ready = new Promise<void>((resolve) => {
        started = resolve;
      });
    purge.mockImplementationOnce(async (source) => {
      started();
      await waiting;
      bytes.delete(source.storageKey);
    });
    const running = retention.execute(
      reviewerId,
      preview.id,
      preview.manifestHash,
    );
    await ready;
    try {
      await retention.execute(reviewerId, preview.id, preview.manifestHash);
      const item = await prisma.contractRetentionItem.findFirstOrThrow({
        where: { batchId: preview.id, subjectType: "asset" },
      });
      expect(item.status).toBe("deleting");
      expect(item.leaseToken).not.toBeNull();
      expect(item.attempts).toBe(1);
      await expect(
        retention.hold(userId, {
          assetId: asset.id,
          reason: "A hold during in-flight storage deletion.",
          legalBasis:
            "Synthetic legal hold request during an active deletion lease.",
        }),
      ).rejects.toThrow("in-flight");
    } finally {
      release();
    }
    expect((await running).status).toBe("completed");
  });
  it("purges closed-rental media under its own approved policy while preserving an asset digest", async () => {
    await approvedPolicy("media");
    const pkg = await closeForRetention(await newPackage()),
      asset = await support.store(
        Buffer.from("Synthetic handover photo"),
        "image/png",
        userId,
      );
    const photo = await prisma.scooterPhoto.create({
      data: {
        rentalId: pkg.rentalId,
        scooterId,
        assetId: asset.id,
        fileName: "synthetic-handover.png",
        position: 0,
        type: "RENTAL_BEFORE",
      },
    });
    const snapshot = packageSnapshotSchema.parse(pkg.snapshot);
    snapshot.rentalMedia = [
      {
        photoId: photo.id,
        eventType: "handover",
        assetId: asset.id,
        sha256: asset.checksumSha256,
        contentType: "image/png",
        fileName: photo.fileName,
      },
    ];
    await prisma.documentPackage.update({
      where: { id: pkg.id },
      data: { snapshot: json(snapshot) },
    });
    const preview = await approvedPreview(pkg.id, "media");
    expect(
      (await retention.execute(reviewerId, preview.id, preview.manifestHash))
        .status,
    ).toBe("completed");
    expect(
      (await prisma.scooterPhoto.findUniqueOrThrow({ where: { id: photo.id } }))
        .deletedAt,
    ).not.toBeNull();
    expect(
      (await prisma.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } }))
        .checksumSha256,
    ).toBe(asset.checksumSha256);
  });
  it("redacts only expired contractual audit content and retains a digest instead of deleting audit or finance rows", async () => {
    await approvedPolicy("audit");
    const pkg = await closeForRetention(await newPackage());
    const event = await prisma.auditEvent.create({
      data: {
        type: "CONTRACT_PACKAGE_CHANGED",
        userId,
        targetType: "ContractWorkflow",
        targetId: pkg.id,
        ip: "127.0.0.1",
        userAgent: "Synthetic client",
        meta: { personalTestDetail: "Synthetic identity observation" },
        createdAt: new Date(Date.now() - 40 * 86400_000),
      },
    });
    const preview = await approvedPreview(pkg.id, "audit");
    expect(
      (await retention.execute(reviewerId, preview.id, preview.manifestHash))
        .status,
    ).toBe("completed");
    const redacted = await prisma.auditEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(redacted.retentionOriginalHash).toMatch(/^[a-f0-9]{64}$/);
    expect(redacted.retentionPurgedAt).not.toBeNull();
    expect(redacted.ip).toBeNull();
    expect(redacted.userAgent).toBeNull();
    expect(redacted.userId).toBeNull();
    expect(redacted.type).toBe(event.type);
    expect(redacted.targetId).toBe(event.targetId);
    expect(redacted.meta).not.toHaveProperty("personalTestDetail");
  });
  it("blocks a minor or unknown-age lessee even when a different adult is the authorized driver", async () => {
    const pkg = await newPackage();
    const driver = await prisma.person.create({
      data: {
        userId: reviewerId,
        email: `${prefix}-adult-driver@example.invalid`,
        phone: `+40${randomInt(100_000_000, 999_999_999)}`,
        firstName: "Synthetic",
        lastName: "Adult driver",
        dateOfBirth: new Date("1990-01-01"),
      },
    });
    try {
      await prisma.rentalParticipant.create({
        data: { rentalId: pkg.rentalId, personId: driver.id, role: "driver" },
      });
      for (const dateOfBirth of [new Date("2012-01-01"), null]) {
        await prisma.person.update({
          where: { id: personId },
          data: { dateOfBirth },
        });
        await expect(
          prisma.$transaction((tx) =>
            buildPackageSnapshot(tx, pkg.rentalId, companyId, "TEST-MINOR"),
          ),
        ).rejects.toThrow("representation procedure");
      }
    } finally {
      await prisma.rentalParticipant.deleteMany({
        where: { rentalId: pkg.rentalId },
      });
      await prisma.person.delete({ where: { id: driver.id } });
      await prisma.person.update({
        where: { id: personId },
        data: { dateOfBirth: new Date("1990-01-01") },
      });
    }
  });
});
