import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { createCanvas } from "@napi-rs/canvas";
import { SigningService } from "./signing.service";
import { SigningController } from "./signing.controller";
import { digest } from "./contract-support";
import { signatureDataUrl, sanitizeSigningImage } from "./signing-images";
import type { Env } from "../config/env";
import type { ContractSupport } from "./contract-support";
import type { PackagesService } from "./packages.service";
import type { OtpDeliveryQuotaService } from "../auth/modules/otp-challenge/otp-delivery-quota.service";
import type { Request, Response } from "express";

jest.mock("./package-integrity", () => ({
  assertPackageCurrent: jest.fn(() => Promise.resolve(undefined)),
}));

const now = () => new Date();
const token = "a".repeat(43),
  hash = "b".repeat(64);
const settings = {
  brandName: "Scooter City",
  gpsHistoryStatement: "A statement about GPS history",
  registryNumber: "J12/34/2020",
  address: "Example address",
  city: "București",
  county: "București",
  phone: "+40712345678",
  email: "office@example.test",
  iban: "RO00BANK0000000000000000",
  bank: "Bank",
  representativeUserId: "representative",
  representativeCapacity: "Administrator",
  selfieNotice:
    "Approved notice explaining the purpose, legal basis, access, rights and retention of the selfie.",
  selfieNoticeVersion: "v1",
  signingAcceptanceText:
    "Approved explicit action-specific contractual acceptance text.",
  privacyRetentionDays: 30,
  contractRetentionDays: 3650,
  legalReviewStatement:
    "This synthetic test configuration was approved for fixture use.",
};
const terms = {
  schemaVersion: 1,
  tariffVersion: "v1",
  commercialCategory: "without_license",
  promotion: "standard",
  weeklyRateMinor: 30000,
  depositMinor: 30000,
  initialRentMinor: 30000,
  initialTotalMinor: 60000,
  initialCoverageDays: 7,
  agreementMonths: 24,
  noticeDays: 7,
  timezone: "Europe/Bucharest",
  rentalPaymentMethod: "cash",
  depositPaymentMethod: "cash",
};
const inspection = {
  schemaVersion: 1,
  odometerDisplayedKm: 15000,
  odometer: "ok",
  speedometer: "ok",
  brakes: "ok",
  tyres: "ok",
  lights: "ok",
  horn: "ok",
  mirrors: "ok",
  phoneStand: { presence: "absent", condition: "not_applicable" },
  chargingOutlet: { presence: "absent", condition: "not_applicable" },
  helmetCount: 1,
  keysCount: 2,
  fuelPercent: 50,
  observedSpeedKmh: 25,
  speedVerificationMethod: "Verified in private inspection",
  limiterCheck: "ok",
  operatorSpeedConfirmed: true,
  cosmeticNotes: "",
  mediaIds: [],
  criticalDefect: null,
  technicalNotes: "",
  equipmentNotes: "",
  additionalChecks: Object.fromEntries(
    [
      "engine",
      "electricStart",
      "kickstart",
      "batteryCharge",
      "frontTyre",
      "rearTyre",
      "headlight",
      "indicators",
      "brakeLight",
      "helmet",
      "keys",
    ].map((key) => [key, "ok"]),
  ),
  additionalEquipment: Object.fromEntries(
    ["topCase", "luggageRack", "antitheft"].map((key) => [
      key,
      { presence: "absent", condition: "not_applicable" },
    ]),
  ),
};
function drawnSignature(): string {
  const canvas = createCanvas(200, 100),
    ctx = canvas.getContext("2d");
  ctx.strokeStyle = "black";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(10, 60);
  ctx.lineTo(70, 20);
  ctx.lineTo(100, 70);
  ctx.lineTo(180, 35);
  ctx.stroke();
  return canvas.toDataURL("image/png");
}
function makeHarness() {
  const documents = [
    "RENTAL_AGREEMENT",
    "GDPR_NOTICE",
    "TECHNICAL_HANDOVER",
  ].map((type, i) => ({
    id: `doc-${i}`,
    packageId: "package",
    type,
    templateVersionId: `version-${i}`,
    contentHash: hash,
    signedHash: null,
    signedAt: null,
    status: "published",
    requiresLimiterSignature: i === 2,
    signatures: [] as Array<Record<string, unknown>>,
  }));
  const pkg = {
    id: "package",
    companyId: "company",
    rentalId: "rental",
    revision: 1,
    rentalRevision: 2,
    status: "published",
    templateSetVersionId: "set",
    manifestHash: hash,
    subjectHash: hash,
    sourceFingerprint: hash,
    documents,
    identityStatus: "approved",
    identityApprovedAt: now(),
    identityDocumentId: "identity",
    selfieAssetId: "selfie",
    phoneVerifiedAt: now(),
    customerCompletedAt: null as Date | null,
    companyAcceptedAt: null as Date | null,
    contractConcludedAt: null,
    createdAt: now(),
    error: null,
    snapshot: {
      schemaVersion: 1,
      finalOtpRequired: false,
      contractNumber: "SC-1",
      createdAt: now().toISOString(),
      personId: "person",
      personName: "Test Person",
      phone: "+40712345678",
      email: "person@example.test",
      companyId: "company",
      companyName: "Company",
      companySettings: settings,
      identityDocumentId: "identity",
      representativeName: "Test Representative",
      terms,
      inspection,
      limiterKind: "LIMITED",
      limiterKmh: 25,
      maxSpeedKmh: 45,
      logoAssetId: null,
      display: {
        speedDeclaration: "Declarația verificată de limitare la 25 km/h.",
      },
    },
  };
  const session = {
    id: "session",
    tokenHash: digest(token),
    packageId: pkg.id,
    package: pkg,
    phone: "+40712345678",
    expiresAt: new Date(Date.now() + 3600_000),
    lastActiveAt: now(),
    revokedAt: null as Date | null,
    phoneVerifiedAt: now() as Date | null,
    finalVerifiedAt: null as Date | null,
    otpHash: null as string | null,
    otpPurpose: null as string | null,
    otpExpiresAt: null as Date | null,
    otpSentAt: null as Date | null,
    otpAttempts: 0,
    otpSends: 0,
  };
  const assets = new Map<string, { id: string; checksumSha256: string }>();
  const transaction = jest.fn<Promise<unknown>, [(tx: unknown) => unknown]>();
  const db = {
    $transaction: transaction,
    $queryRaw: jest.fn(() => Promise.resolve([])),
    rentalSigningSession: {
      findUnique: jest.fn(() => Promise.resolve(session)),
      findUniqueOrThrow: jest.fn(() => Promise.resolve(session)),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        for (const [key, value] of Object.entries(data)) {
          if (value && typeof value === "object" && "increment" in value)
            (session as Record<string, unknown>)[key] =
              Number((session as Record<string, unknown>)[key]) +
              Number(value.increment);
          else (session as Record<string, unknown>)[key] = value;
        }
        return Promise.resolve(session);
      }),
      updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
    },
    rental: {
      findUniqueOrThrow: jest.fn(() =>
        Promise.resolve({
          id: "rental",
          scooterId: "scooter",
          status: "reserved",
          startsAt: new Date(Date.now() - 60_000),
          endsAt: new Date(Date.now() + 3600_000),
        }),
      ),
    },
    documentPackage: {
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        Object.assign(pkg, data);
        return Promise.resolve(pkg);
      }),
      findUniqueOrThrow: jest.fn(() => Promise.resolve(pkg)),
    },
    documentSignature: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const row = {
          ...data,
          id: `sig-${String(data.documentId)}-${String(data.role)}`,
          createdAt: now(),
        };
        documents.find((d) => d.id === data.documentId)!.signatures.push(row);
        return Promise.resolve(row);
      }),
    },
    mediaAsset: {
      findUniqueOrThrow: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(assets.get(where.id)),
      ),
    },
    signingInvitation: {
      findUnique: jest.fn(),
      updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
    },
  };
  transaction.mockImplementation((run) => Promise.resolve(run(db)));
  const support = {
    prisma: db,
    require: jest.fn(() => Promise.resolve(undefined)),
    event: jest.fn(() => Promise.resolve(undefined)),
    store: jest.fn((bytes: Buffer) => {
      const row = { id: `asset-${assets.size}`, checksumSha256: digest(bytes) };
      assets.set(row.id, row);
      return Promise.resolve(row);
    }),
  };
  const packages = {
    finalize: jest.fn(() => Promise.resolve(undefined)),
    get: jest.fn(() => Promise.resolve(pkg)),
  };
  const sms = {
      send: jest
        .fn<Promise<void>, [{ to: string; body: string }]>()
        .mockResolvedValue(undefined),
    },
    mailer = { send: jest.fn() },
    quotas = { reserve: jest.fn(() => Promise.resolve([])) };
  const env = {
    NODE_ENV: "test",
    SMS_PROVIDER: "smso",
    OTP_HMAC_SECRET: "s".repeat(32),
    APP_BASE_URL: "http://localhost:3001",
    API_BASE_URL: "http://localhost:3000",
    CORS_ORIGINS: [],
    CONTRACT_FINAL_OTP_ENABLED: false,
    CONTRACT_INVITATION_TTL_SECONDS: 86400,
    CONTRACT_SESSION_TTL_SECONDS: 7200,
    CONTRACT_SESSION_IDLE_SECONDS: 1800,
    CONTRACT_OTP_TTL_SECONDS: 300,
    CONTRACT_OTP_MAX_ATTEMPTS: 5,
    CONTRACT_OTP_MAX_SENDS: 10,
    CONTRACT_OTP_RESEND_SECONDS: 60,
  } as unknown as Env;
  const service = new SigningService(
    support as unknown as ContractSupport,
    packages as unknown as PackagesService,
    sms,
    mailer,
    quotas as unknown as OtpDeliveryQuotaService,
    env,
  );
  return {
    service,
    session,
    pkg,
    documents,
    db,
    support,
    packages,
    sms,
    quotas,
    env,
  };
}

describe("Guest signing boundaries", () => {
  it("reveals no document metadata before phone verification", async () => {
    const h = makeHarness();
    h.session.phoneVerifiedAt = null;
    const state = await h.service.state(token);
    expect(state.documents).toEqual([]);
    expect(state.phoneMasked).not.toContain("712345678");
    expect(state).not.toHaveProperty("snapshot");
    expect(state).not.toHaveProperty("personName");
  });
  it("rejects missing, revoked, expired and inactive sessions", async () => {
    const h = makeHarness();
    await expect(h.service.state("bad")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    h.session.revokedAt = now();
    await expect(h.service.state(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    h.session.revokedAt = null;
    h.session.expiresAt = new Date(Date.now() - 1);
    await expect(h.service.state(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    h.session.expiresAt = new Date(Date.now() + 3600_000);
    h.session.lastActiveAt = new Date(Date.now() - 31 * 60_000);
    await expect(h.service.state(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
  it("does not let a guest use another package's document id", async () => {
    const h = makeHarness();
    await expect(
      h.service.sign(
        token,
        "other-rental-document",
        { contentHash: hash, signaturePng: drawnSignature(), acceptance: true },
        false,
        { ip: null },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(h.db.documentSignature.create).not.toHaveBeenCalled();
  });
  it("allows only pinned supporting files after phone verification", async () => {
    const h = makeHarness();
    Object.assign(h.pkg.snapshot, {
      vehicleDocuments: [
        {
          documentId: "vehicle-doc",
          type: "insurance",
          assetId: "client-copy",
          sha256: hash,
          contentType: "application/pdf",
          fileName: "insurance.pdf",
        },
      ],
    });
    expect((await h.service.state(token)).supportingFiles).toEqual([
      expect.objectContaining({
        assetId: "client-copy",
        category: "vehicle_document",
      }),
    ]);
    await expect(
      h.service.supportingFile(token, "other-rental-asset"),
    ).rejects.toThrow("authorized package");
    h.session.phoneVerifiedAt = null;
    expect((await h.service.state(token)).supportingFiles).toEqual([]);
    await expect(
      h.service.supportingFile(token, "client-copy"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it("requires exact identity approval before any signature act", async () => {
    const h = makeHarness();
    h.pkg.identityStatus = "submitted";
    await expect(
      h.service.sign(
        token,
        "doc-0",
        { contentHash: hash, signaturePng: drawnSignature(), acceptance: true },
        false,
        { ip: null },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it("suspends the package and all links when the client reports an error", async () => {
    const h = makeHarness();
    await h.service.telemetry(token, {
      documentId: "doc-0",
      event: "error_reported",
      message: "Incorrect address",
    });
    expect(h.pkg.status).toBe("suspended");
    expect(h.db.rentalSigningSession.updateMany).toHaveBeenCalled();
    expect(h.db.signingInvitation.updateMany).toHaveBeenCalled();
  });
});

describe("Package-bound signing OTP", () => {
  it("delivers only to the snapshotted phone and consumes a code once", async () => {
    const h = makeHarness();
    h.session.phoneVerifiedAt = null;
    await h.service.requestOtp(token, "phone", { ip: "127.0.0.1" });
    expect(h.sms.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "+40712345678" }),
    );
    const code = h.sms.send.mock.calls[0][0].body.match(/\b\d{6}\b/)![0];
    expect(h.session.otpHash).not.toEqual(digest(code));
    await h.service.verifyOtp(token, "phone", code, { ip: "127.0.0.1" });
    expect(h.session.phoneVerifiedAt).toBeInstanceOf(Date);
    expect(h.session.otpHash).toBeNull();
    await expect(
      h.service.verifyOtp(token, "phone", code, { ip: "127.0.0.1" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(JSON.stringify(h.support.event.mock.calls)).not.toContain(code);
  });
  it("preserves cumulative failed attempts across a resend and invalidates its old code", async () => {
    const h = makeHarness();
    h.session.phoneVerifiedAt = null;
    await h.service.requestOtp(token, "phone", { ip: null });
    const firstHash = h.session.otpHash;
    await expect(
      h.service.verifyOtp(token, "phone", "not-a-code", { ip: null }),
    ).rejects.toBeInstanceOf(BadRequestException);
    h.session.otpSentAt = new Date(Date.now() - 61_000);
    await h.service.requestOtp(token, "phone", { ip: null });
    expect(h.session.otpAttempts).toBe(1);
    expect(h.session.otpHash).not.toEqual(firstHash);
    h.session.otpAttempts = 5;
    h.session.otpSentAt = new Date(Date.now() - 61_000);
    await expect(
      h.service.requestOtp(token, "phone", { ip: null }),
    ).rejects.toMatchObject({ status: 429 });
  });
  it("refuses the log SMS fallback and final OTP before document acts", async () => {
    const h = makeHarness();
    h.env.SMS_PROVIDER = "log";
    await expect(
      h.service.requestOtp(token, "phone", { ip: null }),
    ).rejects.toMatchObject({ status: 503 });
    expect(h.sms.send).not.toHaveBeenCalled();
    h.env.SMS_PROVIDER = "smso";
    h.env.CONTRACT_FINAL_OTP_ENABLED = true;
    h.pkg.snapshot.finalOtpRequired = true;
    await expect(
      h.service.requestOtp(token, "final", { ip: null }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("Independent document signing acts", () => {
  it("enforces order, exact hash and a separate limiter signature", async () => {
    const h = makeHarness();
    const input = {
      contentHash: hash,
      signaturePng: drawnSignature(),
      acceptance: true as const,
    };
    await expect(
      h.service.sign(token, "doc-1", input, false, { ip: null }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      h.service.sign(
        token,
        "doc-0",
        { ...input, contentHash: "c".repeat(64) },
        false,
        { ip: null },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await h.service.sign(token, "doc-0", input, false, { ip: null });
    await h.service.sign(token, "doc-1", input, false, { ip: null });
    await h.service.sign(token, "doc-2", input, false, { ip: null });
    await expect(
      h.service.complete(token, { manifestHash: hash, acceptance: true }),
    ).rejects.toBeInstanceOf(ConflictException);
    await h.service.sign(token, "doc-2", input, true, { ip: null });
    await h.service.complete(token, { manifestHash: hash, acceptance: true });
    expect(h.pkg.customerCompletedAt).toBeInstanceOf(Date);
    expect(h.pkg.companyAcceptedAt).toBeNull();
    expect(h.packages.finalize).not.toHaveBeenCalled();
    expect(h.documents[1].signatures[0].acceptanceText).toContain("am primit");
  });
  it("requires each company document act and the configured representative", async () => {
    const h = makeHarness();
    const input = {
      documentId: "doc-0",
      contentHash: hash,
      signaturePng: drawnSignature(),
      acceptance: true as const,
    };
    await expect(
      h.service.companySign("another-staff-member", "package", input),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await h.service.companySign("representative", "package", input);
    expect(h.pkg.companyAcceptedAt).toBeNull();
    await h.service.companySign("representative", "package", {
      ...input,
      documentId: "doc-1",
    });
    await h.service.companySign("representative", "package", {
      ...input,
      documentId: "doc-2",
    });
    expect(h.pkg.companyAcceptedAt).toBeInstanceOf(Date);
    expect(
      h.documents.every((d) => d.signatures.some((s) => s.role === "company")),
    ).toBe(true);
  });
});

describe("Raster identity and signature upload", () => {
  it("accepts a drawn PNG and rejects blank or disguised images", async () => {
    await expect(signatureDataUrl(drawnSignature())).resolves.toBeInstanceOf(
      Buffer,
    );
    await expect(
      signatureDataUrl(createCanvas(200, 100).toDataURL("image/png")),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      sanitizeSigningImage(
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
        false,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it("requires the exact acknowledged selfie notice and a verified phone", async () => {
    const h = makeHarness();
    await expect(
      h.service.selfie(token, undefined, "old-notice", "true"),
    ).rejects.toBeInstanceOf(BadRequestException);
    h.session.phoneVerifiedAt = null;
    await expect(
      h.service.selfie(token, undefined, "v1", "true"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("Signing CSRF boundary", () => {
  it("requires both the custom header and an allowed Origin before exchanging a token", async () => {
    const h = makeHarness(),
      controller = new SigningController(h.service);
    const res = { set: jest.fn(), cookie: jest.fn() } as unknown as Response;
    const request = (origin?: string, requested?: string) =>
      ({
        header: (name: string) =>
          name === "origin"
            ? origin
            : name === "x-requested-with"
              ? requested
              : undefined,
      }) as unknown as Request;
    await expect(
      controller.exchange(request("https://evil.test", "fetch"), res, {
        token,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.exchange(request("http://localhost:3001"), res, { token }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.db.signingInvitation.findUnique).not.toHaveBeenCalled();
  });
});
