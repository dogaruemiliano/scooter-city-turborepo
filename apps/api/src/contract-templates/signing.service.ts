import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHmac, randomBytes, randomInt } from "node:crypto";
import { Cron } from "@nestjs/schedule";
import { z } from "zod";
import { v1 } from "@repo/api-shared";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import type { Prisma } from "../generated/prisma/client";
import { SmsService } from "../sms/sms.service";
import { MailerService } from "../mailer/mailer.service";
import { safeEqualHex } from "../auth/utils/hash";
import { OtpDeliveryQuotaService } from "../auth/modules/otp-challenge/otp-delivery-quota.service";
import { ContractSupport, digest } from "./contract-support";
import {
  PackagesService,
  packageDto,
  packageInclude,
} from "./packages.service";
import { packageSnapshotSchema } from "./contract-data";
import { assertPackageCurrent } from "./package-integrity";
import { sanitizeSigningImage, signatureDataUrl } from "./signing-images";
import {
  documentAcceptanceText,
  limiterAcceptanceText,
} from "./signing-acceptance";

const sessionInclude = {
  package: { include: packageInclude },
} satisfies Prisma.RentalSigningSessionInclude;
type SessionRow = Prisma.RentalSigningSessionGetPayload<{
  include: typeof sessionInclude;
}>;
type SigningContext = { ip: string | null; userAgent?: string | null };
const order = (type: string) =>
  [...v1.contracts.documentOrder, "PROMOTION_ADDENDUM"].indexOf(type);
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

/** A guest session proves control of one package's contact channel, never a general user login. */
@Injectable()
export class SigningService {
  constructor(
    readonly support: ContractSupport,
    readonly packages: PackagesService,
    readonly sms: SmsService,
    readonly mailer: MailerService,
    readonly quotas: OtpDeliveryQuotaService,
    @Inject(ENV) readonly env: Env,
  ) {}

  private requireSms(): void {
    // The log implementation exposes message bodies. Signing secrets may never use it.
    if (this.env.SMS_PROVIDER !== "smso")
      throw new ServiceUnavailableException(
        "Configure the SMS provider before sending signing codes or links",
      );
  }

  private invitationToken(id: string): string {
    // The random ID is a nonce, not an authorization token. Only the server secret
    // can recreate this opaque token for a durable delivery retry.
    return createHmac("sha256", this.env.OTP_HMAC_SECRET)
      .update(`rental-invitation:v2:${id}`)
      .digest("base64url");
  }

  async invite(
    userId: string,
    packageId: string,
    input: z.infer<typeof v1.contracts.inviteInputSchema>,
  ) {
    if (input.channel === "sms") this.requireSms();
    const invitationId = await this.support.prisma.$transaction(async (tx) => {
      await this.support.require(userId, "documents.manage", tx);
      const company = await this.support.company(tx);
      return this.support.command(
        tx,
        input.idempotencyKey,
        "signing.invite",
        packageId,
        input,
        async () => {
          const reference = await tx.documentPackage.findUniqueOrThrow({
            where: { id: packageId },
            select: { rental: { select: { id: true, scooterId: true } } },
          });
          await tx.$queryRaw`SELECT id FROM "Scooter" WHERE id = ${reference.rental.scooterId} FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM "Rental" WHERE id = ${reference.rental.id} FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM "DocumentPackage" WHERE id = ${packageId} FOR UPDATE`;
          const pkg = await tx.documentPackage.findFirst({
            where: { id: packageId, companyId: company.id },
          });
          if (
            !pkg ||
            pkg.status !== "published" ||
            !pkg.manifestHash ||
            pkg.customerCompletedAt
          )
            throw new ConflictException(
              "Publish the current package before inviting its customer",
            );
          await assertPackageCurrent(tx, pkg);
          await tx.signingInvitation.updateMany({
            where: { packageId, consumedAt: null, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          const id = randomBytes(32).toString("base64url");
          const invitation = await tx.signingInvitation.create({
            data: {
              id,
              packageId,
              tokenVersion: 2,
              channel: input.channel,
              deliveryStatus: "queued",
              tokenHash: digest(this.invitationToken(id)),
              expiresAt: new Date(
                Date.now() + this.env.CONTRACT_INVITATION_TTL_SECONDS * 1000,
              ),
            },
          });
          await this.support.event(
            tx,
            userId,
            packageId,
            "invitation.created",
            { invitationId: invitation.id, channel: input.channel },
          );
          return invitation.id;
        },
      );
    });
    const status = await this.deliverInvitation(invitationId);
    return { invitationId, status };
  }

  /** Invitations are a durable outbox too; a crashed sender never generates a different link. */
  @Cron("*/30 * * * * *")
  async dispatchInvitations(): Promise<void> {
    if (!this.env.CONTRACT_WORKFLOW_ENABLED) return;
    await this.support.prisma.signingInvitation.updateMany({
      where: {
        deliveryStatus: "sending",
        deliveryLeaseUntil: { lt: new Date() },
      },
      data: { deliveryStatus: "uncertain", deliveryLeaseUntil: null },
    });
    const pending = await this.support.prisma.signingInvitation.findMany({
      where: {
        tokenVersion: 2,
        deliveryStatus: { in: ["queued", "failed"] },
        deliveryNextRunAt: { lte: new Date() },
        deliveryAttempts: { lt: 5 },
        revokedAt: null,
        consumedAt: null,
        expiresAt: { gt: new Date() },
        package: { status: "published" },
      },
      orderBy: { createdAt: "asc" },
      take: 10,
      select: { id: true },
    });
    for (const invitation of pending) {
      try {
        await this.deliverInvitation(invitation.id);
      } catch {
        /* Durable status and an audited failure remain visible for recovery. */
      }
    }
  }

  private async deliverInvitation(id: string): Promise<string> {
    const invitation =
      await this.support.prisma.signingInvitation.findUniqueOrThrow({
        where: { id },
        include: { package: true },
      });
    if (invitation.deliveryStatus === "sent") return "sent";
    if (invitation.consumedAt) return "consumed";
    if (
      invitation.tokenVersion !== 2 ||
      invitation.revokedAt ||
      invitation.expiresAt <= new Date() ||
      invitation.package.status !== "published"
    )
      throw new ConflictException(
        "This invitation is no longer available; issue a new link",
      );
    if (
      invitation.deliveryStatus === "uncertain" ||
      (invitation.deliveryStatus === "sending" &&
        invitation.deliveryLeaseUntil &&
        invitation.deliveryLeaseUntil <= new Date())
    ) {
      await this.support.prisma.signingInvitation.updateMany({
        where: { id, deliveryStatus: "sending" },
        data: { deliveryStatus: "uncertain", deliveryLeaseUntil: null },
      });
      throw new ConflictException(
        "Invitation delivery outcome is uncertain. Issue a new link to revoke the previous invitation before resending.",
      );
    }
    if (
      !["queued", "failed"].includes(invitation.deliveryStatus) ||
      invitation.deliveryAttempts >= 5 ||
      invitation.deliveryNextRunAt > new Date()
    )
      throw new ConflictException(
        "Invitation delivery is pending; wait before retrying",
      );
    const leaseUntil = new Date(Date.now() + 5 * 60_000);
    const claimed = await this.support.prisma.signingInvitation.updateMany({
      where: {
        id,
        deliveryStatus: invitation.deliveryStatus,
        deliveryAttempts: invitation.deliveryAttempts,
        revokedAt: null,
        consumedAt: null,
      },
      data: {
        deliveryStatus: "sending",
        deliveryLeaseUntil: leaseUntil,
        deliveryAttempts: { increment: 1 },
      },
    });
    if (!claimed.count)
      throw new ConflictException("Invitation delivery is already running");
    let attempted = false;
    try {
      const snapshot = packageSnapshotSchema.parse(invitation.package.snapshot);
      if (digest(this.invitationToken(id)) !== invitation.tokenHash)
        throw new ConflictException(
          "The invitation signing key changed; issue a new link",
        );
      const link = new URL("/ro/signing", this.env.APP_BASE_URL);
      link.hash = `token=${this.invitationToken(id)}`;
      if (invitation.channel === "sms") {
        this.requireSms();
        attempted = true;
        await this.sms.send({
          to: snapshot.phone,
          body: `Scooter City: Documentele pentru semnare sunt disponibile: ${link.toString()}`,
        });
      } else {
        attempted = true;
        await this.mailer.send({
          to: snapshot.email,
          subject: "Documentele tale Scooter City",
          text: `Accesează documentele și verifică numărul de telefon înainte de semnare: ${link.toString()}`,
          messageId: `<signing-invitation-${id}@scooter-city.local>`,
        });
      }
      await this.support.prisma.$transaction(async (tx) => {
        await tx.signingInvitation.updateMany({
          where: {
            id,
            deliveryStatus: "sending",
            deliveryLeaseUntil: leaseUntil,
          },
          data: {
            deliveryStatus: "sent",
            sentAt: new Date(),
            deliveryLeaseUntil: null,
          },
        });
        await this.support.event(
          tx,
          null,
          invitation.packageId,
          "invitation.sent",
          {
            invitationId: id,
            channel: invitation.channel,
            source: "provider_acknowledgement",
          },
        );
      });
      return "sent";
    } catch (error: unknown) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "";
      const definitelyRejected =
        !attempted ||
        ["EAUTH", "EENVELOPE", "ECONNECTION", "EDNS"].includes(code) ||
        (error instanceof Error &&
          /SMSO.ro send failed: HTTP 4\d\d|SMSO.ro send returned non-200 envelope/.test(
            error.message,
          ));
      await this.support.prisma.signingInvitation.updateMany({
        where: {
          id,
          deliveryStatus: "sending",
          deliveryLeaseUntil: leaseUntil,
        },
        data: {
          deliveryStatus: definitelyRejected ? "failed" : "uncertain",
          deliveryLeaseUntil: null,
          deliveryNextRunAt: new Date(Date.now() + 60_000),
        },
      });
      await this.support.event(
        this.support.prisma,
        null,
        invitation.packageId,
        "invitation.failed",
        {
          invitationId: id,
          channel: invitation.channel,
          outcome: definitelyRejected ? "rejected" : "uncertain",
        },
      );
      throw new ServiceUnavailableException(
        definitelyRejected
          ? "Invitation delivery failed; retry after checking provider configuration"
          : "Invitation delivery outcome is uncertain; issue a new link to revoke the previous one",
      );
    }
  }

  /** GET previews never consume an invitation. Only this explicit POST exchanges it once. */
  async exchange(
    token: string,
    context: SigningContext,
  ): Promise<{ token: string; state: v1.contracts.SigningState }> {
    if (!tokenPattern.test(token))
      throw new UnauthorizedException("Invalid or expired invitation");
    const sessionToken = randomBytes(32).toString("base64url");
    const session = await this.support.prisma.$transaction(async (tx) => {
      const invitation = await tx.signingInvitation.findUnique({
        where: { tokenHash: digest(token) },
        include: { package: true },
      });
      if (
        !invitation ||
        invitation.revokedAt ||
        invitation.consumedAt ||
        invitation.expiresAt <= new Date() ||
        invitation.package.status !== "published"
      )
        throw new UnauthorizedException("Invalid or expired invitation");
      const rental = await tx.rental.findUniqueOrThrow({
        where: { id: invitation.package.rentalId },
      });
      await tx.$queryRaw`SELECT id FROM "Scooter" WHERE id = ${rental.scooterId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "Rental" WHERE id = ${rental.id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "DocumentPackage" WHERE id = ${invitation.packageId} FOR UPDATE`;
      const currentPackage = await tx.documentPackage.findUniqueOrThrow({
        where: { id: invitation.packageId },
      });
      if (
        currentPackage.status !== "published" ||
        currentPackage.customerCompletedAt
      )
        throw new UnauthorizedException("Invalid or expired invitation");
      await assertPackageCurrent(tx, currentPackage);
      const claimed = await tx.signingInvitation.updateMany({
        where: {
          id: invitation.id,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });
      if (claimed.count !== 1)
        throw new UnauthorizedException("Invalid or expired invitation");
      const snapshot = packageSnapshotSchema.parse(currentPackage.snapshot);
      const row = await tx.rentalSigningSession.create({
        data: {
          packageId: invitation.packageId,
          tokenHash: digest(sessionToken),
          phone: snapshot.phone,
          expiresAt: new Date(
            Date.now() + this.env.CONTRACT_SESSION_TTL_SECONDS * 1000,
          ),
        },
        include: sessionInclude,
      });
      await this.support.event(
        tx,
        null,
        invitation.packageId,
        "session.created",
        {
          sessionId: row.id,
          invitationId: invitation.id,
          ip: context.ip,
          userAgent: context.userAgent ?? null,
        },
      );
      return row;
    });
    return { token: sessionToken, state: this.stateDto(session) };
  }

  private stateDto(session: SessionRow): v1.contracts.SigningState {
    const pkg = session.package,
      snapshot = packageSnapshotSchema.parse(pkg.snapshot);
    const dto = packageDto(pkg);
    return v1.contracts.signingStateSchema.parse({
      packageId: pkg.id,
      manifestHash: pkg.manifestHash,
      phoneMasked: `${session.phone.slice(0, 3)}••••••${session.phone.slice(-3)}`,
      phoneVerified: Boolean(session.phoneVerifiedAt),
      identityStatus: pkg.identityStatus,
      selfieNotice: snapshot.companySettings.selfieNotice,
      selfieNoticeVersion: snapshot.companySettings.selfieNoticeVersion,
      finalOtpRequired: snapshot.finalOtpRequired,
      finalOtpVerified: Boolean(session.finalVerifiedAt),
      signingAcceptanceText: snapshot.companySettings.signingAcceptanceText,
      customerCompletedAt: pkg.customerCompletedAt?.toISOString() ?? null,
      supportingFiles: session.phoneVerifiedAt
        ? this.supportingFiles(snapshot)
        : [],
      documents: session.phoneVerifiedAt
        ? dto.documents.sort((a, b) => order(a.type) - order(b.type))
        : [],
    });
  }

  private supportingFiles(
    snapshot: import("./contract-data").PackageSnapshot,
  ): z.infer<typeof v1.contracts.signingSupportingFileSchema>[] {
    const files: z.infer<typeof v1.contracts.signingSupportingFileSchema>[] = [
      ...snapshot.vehicleDocuments.map((file) => ({
        assetId: file.assetId,
        category: "vehicle_document" as const,
        fileName: file.fileName,
        contentType: file.contentType,
        sha256: file.sha256,
      })),
      ...snapshot.rentalMedia.map((file) => ({
        assetId: file.assetId,
        category: "handover_media" as const,
        fileName: file.fileName,
        contentType: file.contentType,
        sha256: file.sha256,
      })),
    ];
    return [...new Map(files.map((file) => [file.assetId, file])).values()];
  }

  async supportingFile(token: string, assetId: string) {
    const session = await this.session(token);
    if (!session.phoneVerifiedAt)
      throw new ForbiddenException(
        "Verify the phone to read the supporting files",
      );
    const reference = this.supportingFiles(
      packageSnapshotSchema.parse(session.package.snapshot),
    ).find((file) => file.assetId === assetId);
    if (!reference)
      throw new NotFoundException(
        "This file is not part of the authorized package",
      );
    const asset = await this.support.prisma.mediaAsset.findUniqueOrThrow({
      where: { id: assetId },
    });
    if (asset.checksumSha256 !== reference.sha256)
      throw new ConflictException(
        "Supporting evidence differs from its pinned hash",
      );
    const buffer = await this.support.read(asset);
    await this.touch(this.support.prisma, session);
    await this.support.event(
      this.support.prisma,
      null,
      session.packageId,
      "customer.supporting_file_downloaded",
      {
        sessionId: session.id,
        assetId,
        category: reference.category,
        sha256: reference.sha256,
      },
    );
    return {
      buffer,
      contentType: reference.contentType,
      fileName: reference.fileName,
    };
  }

  private async session(
    token: string,
    tx: Prisma.TransactionClient = this.support.prisma,
    lock = false,
  ): Promise<SessionRow> {
    if (!tokenPattern.test(token))
      throw new UnauthorizedException(
        "Signing session expired. Request another link.",
      );
    let row = await tx.rentalSigningSession.findUnique({
      where: { tokenHash: digest(token) },
      include: sessionInclude,
    });
    if (!row)
      throw new UnauthorizedException(
        "Signing session expired. Request another link.",
      );
    if (lock) {
      const reference = await tx.rental.findUniqueOrThrow({
        where: { id: row.package.rentalId },
        select: { scooterId: true },
      });
      await tx.$queryRaw`SELECT id FROM "Scooter" WHERE id = ${reference.scooterId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "Rental" WHERE id = ${row.package.rentalId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "DocumentPackage" WHERE id = ${row.packageId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "RentalSigningSession" WHERE id = ${row.id} FOR UPDATE`;
      row = await tx.rentalSigningSession.findUniqueOrThrow({
        where: { id: row.id },
        include: sessionInclude,
      });
    }
    if (
      row.revokedAt ||
      row.expiresAt <= new Date() ||
      row.lastActiveAt.getTime() +
        this.env.CONTRACT_SESSION_IDLE_SECONDS * 1000 <=
        Date.now() ||
      !["published", "signed"].includes(row.package.status)
    )
      throw new UnauthorizedException(
        "Signing session expired. Request another link.",
      );
    const snapshot = packageSnapshotSchema.parse(row.package.snapshot);
    if (row.phone !== snapshot.phone)
      throw new UnauthorizedException("Contact changed. Request another link.");
    if (row.package.status === "published")
      await assertPackageCurrent(tx, row.package);
    return row;
  }

  private async touch(
    tx: Prisma.TransactionClient,
    session: SessionRow,
  ): Promise<void> {
    await tx.rentalSigningSession.update({
      where: { id: session.id },
      data: { lastActiveAt: new Date() },
    });
  }

  async state(token: string): Promise<v1.contracts.SigningState> {
    const session = await this.session(token);
    await this.touch(this.support.prisma, session);
    return this.stateDto(session);
  }

  private otpDigest(
    session: SessionRow,
    purpose: "phone" | "final",
    code: string,
  ): string {
    return createHmac("sha256", this.env.OTP_HMAC_SECRET)
      .update(
        [
          "rental-signing",
          session.id,
          session.packageId,
          session.package.manifestHash,
          session.package.subjectHash,
          session.phone,
          purpose,
          code,
        ].join("\u0000"),
      )
      .digest("hex");
  }

  private customerActsComplete(pkg: SessionRow["package"]): boolean {
    return (
      pkg.documents.length > 0 &&
      pkg.documents.every(
        (d) =>
          d.signatures.some(
            (s) => s.role === "customer" && s.contentHash === d.contentHash,
          ) &&
          (!d.requiresLimiterSignature ||
            d.signatures.some(
              (s) => s.role === "limiter" && s.contentHash === d.contentHash,
            )),
      )
    );
  }

  async requestOtp(
    token: string,
    purpose: "phone" | "final",
    context: SigningContext,
  ) {
    this.requireSms();
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const reservation = await this.support.prisma.$transaction(async (tx) => {
      const session = await this.session(token, tx, true);
      if (
        session.package.status !== "published" ||
        session.package.customerCompletedAt
      )
        throw new ConflictException("Signing is complete");
      if (
        purpose === "final" &&
        (!packageSnapshotSchema.parse(session.package.snapshot)
          .finalOtpRequired ||
          !session.phoneVerifiedAt ||
          session.package.identityStatus !== "approved" ||
          !this.customerActsComplete(session.package))
      )
        throw new ConflictException(
          "Final verification is not available until every document is signed",
        );
      if (purpose === "phone" && session.phoneVerifiedAt)
        throw new ConflictException("Phone already verified");
      if (
        session.otpAttempts >= this.env.CONTRACT_OTP_MAX_ATTEMPTS ||
        session.otpSends >= this.env.CONTRACT_OTP_MAX_SENDS
      )
        throw new HttpException(
          "Verification limit reached. Request another link.",
          429,
        );
      if (
        session.otpSentAt &&
        session.otpSentAt.getTime() +
          this.env.CONTRACT_OTP_RESEND_SECONDS * 1000 >
          Date.now()
      )
        throw new HttpException("Wait before requesting another code", 429);
      await this.quotas.reserve(tx, {
        target: `rental-signing:${session.phone}`,
        ip: context.ip,
        now: new Date(),
      });
      const hash = this.otpDigest(session, purpose, code);
      await tx.rentalSigningSession.update({
        where: { id: session.id },
        data: {
          otpHash: hash,
          otpPurpose: purpose,
          otpExpiresAt: new Date(
            Date.now() + this.env.CONTRACT_OTP_TTL_SECONDS * 1000,
          ),
          otpSentAt: new Date(),
          otpSends: { increment: 1 },
          ...(purpose === "final" ? { finalVerifiedAt: null } : {}),
          lastActiveAt: new Date(),
        },
      });
      await this.support.event(tx, null, session.packageId, "otp.requested", {
        sessionId: session.id,
        purpose,
      });
      return { id: session.id, phone: session.phone, hash };
    });
    try {
      await this.sms.send({
        to: reservation.phone,
        body: `Scooter City: codul pentru ${purpose === "phone" ? "verificarea telefonului" : "confirmarea documentelor"} este ${code}. Expira in 5 minute.`,
      });
    } catch {
      await this.support.prisma.rentalSigningSession.updateMany({
        where: { id: reservation.id, otpHash: reservation.hash },
        data: { otpHash: null, otpExpiresAt: null },
      });
      throw new ServiceUnavailableException(
        "Signing code delivery failed. Request a new code after the resend delay.",
      );
    }
    return this.state(token);
  }

  async verifyOtp(
    token: string,
    purpose: "phone" | "final",
    code: string,
    context: SigningContext,
  ) {
    const verified = await this.support.prisma.$transaction(async (tx) => {
      const session = await this.session(token, tx, true);
      if (
        session.package.status !== "published" ||
        session.package.customerCompletedAt
      )
        throw new ConflictException("Signing is complete");
      if (
        purpose === "final" &&
        !packageSnapshotSchema.parse(session.package.snapshot).finalOtpRequired
      )
        throw new ConflictException("Final verification is disabled");
      if (
        purpose === "final" &&
        (!session.phoneVerifiedAt ||
          session.package.identityStatus !== "approved" ||
          !this.customerActsComplete(session.package))
      )
        throw new ConflictException(
          "Sign every document before final verification",
        );
      await this.quotas.reserve(tx, {
        target: `rental-signing-verify:${session.phone}`,
        ip: context.ip,
        now: new Date(),
      });
      const valid =
        session.otpAttempts < this.env.CONTRACT_OTP_MAX_ATTEMPTS &&
        session.otpPurpose === purpose &&
        session.otpHash &&
        session.otpExpiresAt &&
        session.otpExpiresAt > new Date() &&
        safeEqualHex(this.otpDigest(session, purpose, code), session.otpHash);
      if (!valid) {
        await tx.rentalSigningSession.update({
          where: { id: session.id },
          data: { otpAttempts: { increment: 1 }, lastActiveAt: new Date() },
        });
        await this.support.event(tx, null, session.packageId, "otp.rejected", {
          sessionId: session.id,
          purpose,
        });
        return false;
      }
      await tx.rentalSigningSession.update({
        where: { id: session.id },
        data: {
          otpHash: null,
          otpPurpose: null,
          otpExpiresAt: null,
          ...(purpose === "phone"
            ? { phoneVerifiedAt: new Date() }
            : { finalVerifiedAt: new Date() }),
          lastActiveAt: new Date(),
        },
      });
      if (purpose === "phone")
        await tx.documentPackage.update({
          where: { id: session.packageId },
          data: { phoneVerifiedAt: new Date() },
        });
      await this.support.event(tx, null, session.packageId, "otp.verified", {
        sessionId: session.id,
        purpose,
        proof: "control_of_phone_channel",
      });
      return true;
    });
    if (!verified)
      throw new BadRequestException("Incorrect, expired or already used code");
    return this.state(token);
  }

  async selfie(
    token: string,
    file: Express.Multer.File | undefined,
    noticeVersion: string,
    noticeAccepted: string,
  ) {
    const session = await this.session(token);
    const snapshot = packageSnapshotSchema.parse(session.package.snapshot);
    if (
      !session.phoneVerifiedAt ||
      session.package.status !== "published" ||
      session.package.customerCompletedAt
    )
      throw new ForbiddenException(
        "Verify the phone before submitting identity evidence",
      );
    if (
      noticeAccepted !== "true" ||
      noticeVersion !== snapshot.companySettings.selfieNoticeVersion
    )
      throw new BadRequestException(
        "Acknowledge the current selfie processing notice first",
      );
    if (!file || !["image/png", "image/jpeg"].includes(file.mimetype))
      throw new BadRequestException(
        "Capture a PNG or JPEG photo with the identity document",
      );
    const bytes = await sanitizeSigningImage(file.buffer, false);
    const asset = await this.support.store(bytes, "image/png");
    await this.support.prisma.$transaction(async (tx) => {
      const current = await this.session(token, tx, true);
      if (
        !current.phoneVerifiedAt ||
        current.package.customerCompletedAt ||
        current.package.identityStatus === "approved"
      )
        throw new ConflictException(
          "An approved identity needs a controlled revision before replacement",
        );
      await tx.documentPackage.update({
        where: { id: current.packageId },
        data: {
          selfieAssetId: asset.id,
          identityStatus: "submitted",
          identityApprovedAt: null,
          identityReviewedBy: null,
          identityReviewReason: null,
        },
      });
      await this.touch(tx, current);
      await this.support.event(
        tx,
        null,
        current.packageId,
        "identity.selfie_submitted",
        {
          sessionId: current.id,
          selfieAssetId: asset.id,
          identityDocumentId: current.package.identityDocumentId,
          noticeVersion,
          captureSource: "browser_camera_claimed_by_client",
        },
      );
    });
    return this.state(token);
  }

  async file(
    token: string,
    documentId: string,
    variant: "presented" | "signed",
  ) {
    const session = await this.session(token);
    if (!session.phoneVerifiedAt)
      throw new ForbiddenException("Verify the phone to read the documents");
    const document = await this.support.prisma.rentalDocument.findFirst({
      where: { id: documentId, packageId: session.packageId },
      include: { presentedAsset: true, signedAsset: true },
    });
    if (!document) throw new NotFoundException("Document unavailable");
    const asset =
      variant === "signed" ? document.signedAsset : document.presentedAsset;
    if (!asset) throw new NotFoundException("Signed copy is not ready");
    const bytes = await this.support.read(asset);
    if (
      digest(bytes) !==
      (variant === "signed" ? document.signedHash : document.contentHash)
    )
      throw new ConflictException(
        "Document bytes do not match the accepted manifest",
      );
    await this.support.event(
      this.support.prisma,
      null,
      session.packageId,
      "document.downloaded",
      { sessionId: session.id, documentId, variant },
    );
    return bytes;
  }

  /** Each act receives newly drawn bytes and is bound to the exact document shown. */
  async sign(
    token: string,
    documentId: string,
    input: z.infer<typeof v1.contracts.documentSignInputSchema>,
    limiter: boolean,
    context: SigningContext,
  ) {
    const initial = await this.session(token);
    if (
      !initial.phoneVerifiedAt ||
      !initial.package.identityApprovedAt ||
      initial.package.identityStatus !== "approved"
    )
      throw new ForbiddenException(
        "Phone verification and manual identity approval are required",
      );
    const initialDocument = initial.package.documents.find(
      (d) => d.id === documentId,
    );
    if (!initialDocument || initialDocument.contentHash !== input.contentHash)
      throw new ConflictException(
        "The document version changed. Request a current link.",
      );
    if (
      initial.package.documents
        .filter((d) => order(d.type) < order(initialDocument.type))
        .some(
          (d) =>
            !d.signatures.some((s) => s.role === "customer") ||
            (d.requiresLimiterSignature &&
              !d.signatures.some((s) => s.role === "limiter")),
        )
    )
      throw new ConflictException("Sign the documents in the required order");
    const signature = await signatureDataUrl(input.signaturePng);
    const asset = await this.support.store(signature, "image/png");
    await this.support.prisma.$transaction(async (tx) => {
      const session = await this.session(token, tx, true),
        pkg = session.package;
      if (
        pkg.status !== "published" ||
        pkg.customerCompletedAt ||
        !session.phoneVerifiedAt ||
        pkg.identityStatus !== "approved" ||
        !pkg.identityApprovedAt
      )
        throw new ConflictException("Signing is not available");
      const document = pkg.documents.find((d) => d.id === documentId);
      if (!document || document.contentHash !== input.contentHash)
        throw new ConflictException(
          "The document version changed. Request a current link.",
        );
      const previousDocuments = pkg.documents.filter(
        (d) => order(d.type) < order(document.type),
      );
      if (
        previousDocuments.some(
          (d) =>
            !d.signatures.some((s) => s.role === "customer") ||
            (d.requiresLimiterSignature &&
              !d.signatures.some((s) => s.role === "limiter")),
        )
      )
        throw new ConflictException("Sign the documents in the required order");
      if (document.type === "TECHNICAL_HANDOVER") {
        const rental = await tx.rental.findUniqueOrThrow({
          where: { id: pkg.rentalId },
        });
        if (
          rental.status !== "reserved" ||
          rental.startsAt > new Date() ||
          rental.endsAt <= new Date()
        )
          throw new ConflictException(
            "Confirm the technical handover in the reserved handover window",
          );
      }
      const role = limiter ? "limiter" : "customer";
      if (
        limiter &&
        (!document.requiresLimiterSignature ||
          !document.signatures.some((s) => s.role === "customer"))
      )
        throw new ConflictException(
          "This document has no pending separate limiter acceptance",
        );
      const previous = document.signatures.find((s) => s.role === role);
      if (previous) {
        const stored = await tx.mediaAsset.findUniqueOrThrow({
          where: { id: previous.assetId },
        });
        if (
          previous.contentHash !== input.contentHash ||
          stored.checksumSha256 !== asset.checksumSha256
        )
          throw new ConflictException("This signing act was already recorded");
        return;
      }
      const snapshot = packageSnapshotSchema.parse(pkg.snapshot);
      await tx.documentSignature.create({
        data: {
          documentId,
          sessionId: session.id,
          signerId: snapshot.personId,
          role,
          contentHash: input.contentHash,
          acceptanceText: limiter
            ? limiterAcceptanceText(snapshot)!
            : documentAcceptanceText(snapshot, document.type),
          assetId: asset.id,
        },
      });
      await this.touch(tx, session);
      await this.support.event(tx, null, pkg.id, "signature.recorded", {
        sessionId: session.id,
        documentId,
        templateVersionId: document.templateVersionId,
        contentHash: input.contentHash,
        role,
        ip: context.ip,
        userAgent: context.userAgent ?? null,
      });
    });
    return this.state(token);
  }

  async companySign(
    userId: string,
    packageId: string,
    input: z.infer<typeof v1.contracts.companySignInputSchema>,
    context?: {
      authenticatedSessionId: string;
      ip: string | null;
      userAgent: string | null;
    },
  ) {
    const reference = await this.packages.get(
      userId,
      packageId,
      "documents.company_sign",
    );
    const snapshot = packageSnapshotSchema.parse(reference.snapshot);
    if (snapshot.companySettings.representativeUserId !== userId)
      throw new ForbiddenException(
        "Only the snapshotted authorized company representative may sign",
      );
    const bytes = await signatureDataUrl(input.signaturePng),
      asset = await this.support.store(bytes, "image/png", userId);
    const mayFinalize = await this.support.prisma.$transaction(async (tx) => {
      await this.support.require(userId, "documents.company_sign", tx);
      const rental = await tx.rental.findUniqueOrThrow({
        where: { id: reference.rentalId },
      });
      await tx.$queryRaw`SELECT id FROM "Scooter" WHERE id = ${rental.scooterId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "Rental" WHERE id = ${rental.id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "DocumentPackage" WHERE id = ${packageId} FOR UPDATE`;
      const pkg = await tx.documentPackage.findUniqueOrThrow({
        where: { id: packageId },
        include: packageInclude,
      });
      await assertPackageCurrent(tx, pkg);
      if (pkg.status !== "published")
        throw new ConflictException(
          "Only the current published package can be signed",
        );
      const document = pkg.documents.find((d) => d.id === input.documentId);
      if (!document || document.contentHash !== input.contentHash)
        throw new ConflictException("Document hash mismatch");
      const existing = document.signatures.find((s) => s.role === "company");
      if (!existing)
        await tx.documentSignature.create({
          data: {
            documentId: document.id,
            signerId: userId,
            role: "company",
            contentHash: input.contentHash,
            acceptanceText: documentAcceptanceText(snapshot, document.type),
            assetId: asset.id,
          },
        });
      else {
        const previousAsset = await tx.mediaAsset.findUniqueOrThrow({
          where: { id: existing.assetId },
        });
        if (previousAsset.checksumSha256 !== asset.checksumSha256)
          throw new ConflictException("Company signing act already recorded");
      }
      const allSigned = pkg.documents.every(
        (d) =>
          d.id === document.id ||
          d.signatures.some((s) => s.role === "company"),
      );
      if (allSigned && !pkg.companyAcceptedAt)
        await tx.documentPackage.update({
          where: { id: packageId },
          data: { companyAcceptedAt: new Date() },
        });
      await this.support.event(
        tx,
        userId,
        packageId,
        "company.signature_recorded",
        {
          documentId: document.id,
          templateVersionId: document.templateVersionId,
          contentHash: input.contentHash,
          authenticatedSessionId: context?.authenticatedSessionId ?? null,
          ip: context?.ip ?? null,
          userAgent: context?.userAgent ?? null,
        },
      );
      return allSigned && Boolean(pkg.customerCompletedAt);
    });
    if (mayFinalize) await this.packages.finalize(packageId);
    return packageDto(await this.packages.get(userId, packageId));
  }

  async complete(
    token: string,
    input: z.infer<typeof v1.contracts.completeSigningInputSchema>,
  ) {
    const result = await this.support.prisma.$transaction(async (tx) => {
      const session = await this.session(token, tx, true),
        pkg = session.package;
      if (pkg.manifestHash !== input.manifestHash)
        throw new ConflictException("Package hash mismatch");
      if (pkg.status === "signed") return { id: pkg.id, finalize: false };
      if (
        pkg.status !== "published" ||
        !session.phoneVerifiedAt ||
        !pkg.identityApprovedAt ||
        pkg.identityStatus !== "approved"
      )
        throw new ConflictException(
          "Contact and manual identity verification are required",
        );
      if (
        packageSnapshotSchema.parse(pkg.snapshot).finalOtpRequired &&
        !session.finalVerifiedAt
      )
        throw new ConflictException(
          "Confirm the final verification code first",
        );
      if (!this.customerActsComplete(pkg))
        throw new ConflictException(
          "Sign each exact document and all required separate declarations first",
        );
      if (!pkg.customerCompletedAt) {
        await tx.documentPackage.update({
          where: { id: pkg.id },
          data: { customerCompletedAt: new Date() },
        });
        await this.support.event(tx, null, pkg.id, "customer.completed", {
          sessionId: session.id,
          manifestHash: input.manifestHash,
          finalOtpRequired: packageSnapshotSchema.parse(pkg.snapshot)
            .finalOtpRequired,
        });
      }
      await this.touch(tx, session);
      return { id: pkg.id, finalize: Boolean(pkg.companyAcceptedAt) };
    });
    if (result.finalize) await this.packages.finalize(result.id);
    return this.state(token);
  }

  async telemetry(
    token: string,
    input: z.infer<typeof v1.contracts.signingTelemetryInputSchema>,
  ) {
    const state = await this.support.prisma.$transaction(async (tx) => {
      const session = await this.session(token, tx, true);
      if (
        !session.phoneVerifiedAt ||
        !session.package.documents.some((d) => d.id === input.documentId)
      )
        throw new NotFoundException("Document unavailable");
      await this.support.event(
        tx,
        null,
        session.packageId,
        "client.telemetry",
        {
          sessionId: session.id,
          documentId: input.documentId,
          event: input.event,
          message: input.message ?? null,
          source: "untrusted_browser_report",
        },
      );
      if (
        input.event === "error_reported" &&
        !session.package.contractConcludedAt
      ) {
        await tx.documentPackage.update({
          where: { id: session.packageId },
          data: {
            status: "suspended",
            error:
              "Customer reported an error; a controlled revision is required",
          },
        });
        await tx.rentalSigningSession.updateMany({
          where: { packageId: session.packageId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.signingInvitation.updateMany({
          where: { packageId: session.packageId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      } else await this.touch(tx, session);
      return this.stateDto(session);
    });
    return state;
  }
}
