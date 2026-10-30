import { ConflictException, Inject, Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { MailerService } from "../mailer/mailer.service";
import { ContractSupport } from "./contract-support";
import { packageSnapshotSchema } from "./contract-data";

/** Durable outbox: sent, delivered and acknowledged are distinct facts. */
@Injectable()
export class ContractDeliveryService {
  constructor(
    readonly support: ContractSupport,
    readonly mailer: MailerService,
    @Inject(ENV) readonly env: Env,
  ) {}
  @Cron("*/30 * * * * *")
  async dispatch(): Promise<void> {
    if (!this.env.CONTRACT_WORKFLOW_ENABLED) return;
    const now = new Date();
    // An interrupted SMTP attempt has an uncertain outcome. Never blindly send it twice.
    await this.support.prisma.contractDelivery.updateMany({
      where: { status: "sending", leaseUntil: { lt: now } },
      data: {
        status: "uncertain",
        error:
          "Delivery worker interrupted; verify provider outcome before retry",
      },
    });
    const candidates = await this.support.prisma.contractDelivery.findMany({
      where: {
        status: { in: ["queued", "failed"] },
        attempts: { lt: 5 },
        nextRunAt: { lte: now },
      },
      take: 10,
      orderBy: { createdAt: "asc" },
    });
    for (const item of candidates) {
      const leaseUntil = new Date(Date.now() + 5 * 60_000);
      const claim = await this.support.prisma.contractDelivery.updateMany({
        where: { id: item.id, status: item.status, attempts: item.attempts },
        data: { status: "sending", leaseUntil, attempts: { increment: 1 } },
      });
      if (!claim.count) continue;
      let attempted = false;
      try {
        const pkg = await this.support.prisma.documentPackage.findUniqueOrThrow(
          {
            where: { id: item.packageId },
            include: { documents: { include: { signedAsset: true } } },
          },
        );
        if (pkg.status !== "signed")
          throw new ConflictException(
            "Only a concluded package can be delivered",
          );
        const snapshot = packageSnapshotSchema.parse(pkg.snapshot);
        const attachments: {
          filename: string;
          content: Buffer;
          contentType: string;
        }[] = [];
        let bytes = 0;
        for (const document of pkg.documents) {
          if (!document.signedAsset)
            throw new ConflictException("A final document is unavailable");
          const content = await this.support.read(document.signedAsset);
          bytes += content.length;
          if (bytes > 20 * 1024 * 1024)
            throw new ConflictException(
              "Document package exceeds email attachment limit; arrange durable delivery manually",
            );
          attachments.push({
            filename: `${snapshot.contractNumber}-${document.type}.pdf`,
            content,
            contentType: "application/pdf",
          });
        }
        for (const reference of snapshot.vehicleDocuments) {
          const asset = await this.support.prisma.mediaAsset.findUniqueOrThrow({
            where: { id: reference.assetId },
          });
          if (asset.checksumSha256 !== reference.sha256)
            throw new ConflictException(
              "A client vehicle copy differs from its pinned hash",
            );
          const content = await this.support.read(asset);
          bytes += content.length;
          if (bytes > 20 * 1024 * 1024)
            throw new ConflictException(
              "Document package exceeds email attachment limit; arrange durable delivery manually",
            );
          attachments.push({
            filename: reference.fileName,
            content,
            contentType: reference.contentType,
          });
        }
        attempted = true;
        await this.mailer.send({
          to: snapshot.email,
          subject: `${snapshot.companyName} — ${snapshot.contractNumber}`,
          text: `Documentele contractuale încheiate sunt atașate. Păstrați aceste exemplare. Predarea fizică a scuterului este consemnată separat.`,
          attachments,
          messageId: `<contract-delivery-${item.id}@scooter-city.local>`,
        });
        await this.support.prisma.$transaction(async (tx) => {
          const updated = await tx.contractDelivery.updateMany({
            where: { id: item.id, status: "sending", leaseUntil },
            data: {
              status: "sent",
              sentAt: new Date(),
              leaseUntil: null,
              error: null,
            },
          });
          if (updated.count)
            await this.support.event(tx, null, pkg.id, "delivery.sent", {
              deliveryId: item.id,
              source: "smtp_acknowledgement",
            });
        });
      } catch (error: unknown) {
        const code =
          error && typeof error === "object" && "code" in error
            ? String(error.code)
            : "";
        const uncertain =
          attempted &&
          !["EAUTH", "EENVELOPE", "ECONNECTION", "EDNS"].includes(code);
        await this.support.prisma.contractDelivery.updateMany({
          where: { id: item.id, status: "sending", leaseUntil },
          data: {
            status: uncertain ? "uncertain" : "failed",
            leaseUntil: null,
            error: uncertain
              ? "SMTP outcome uncertain; verify delivery before retry"
              : "Document delivery failed; inspect provider configuration or file integrity",
            nextRunAt: new Date(
              Date.now() + Math.min(60, 2 ** item.attempts) * 60_000,
            ),
          },
        });
      }
    }
  }
  async list(userId: string, packageId: string) {
    await this.support.require(userId, "documents.read");
    const company = await this.support.company();
    return {
      items: await this.support.prisma.contractDelivery.findMany({
        where: { packageId, package: { companyId: company.id } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          packageId: true,
          channel: true,
          status: true,
          attempts: true,
          sentAt: true,
          deliveredAt: true,
          acknowledgedAt: true,
          error: true,
          nextRunAt: true,
        },
      }),
    };
  }
  async retry(
    userId: string,
    id: string,
    confirmedNotSent: boolean,
    reason: string,
  ) {
    await this.support.prisma.$transaction(async (tx) => {
      await this.support.require(userId, "documents.manage", tx);
      const company = await this.support.company(tx);
      const row = await tx.contractDelivery.findFirst({
        where: { id, package: { companyId: company.id } },
      });
      if (!row || !["failed", "uncertain"].includes(row.status))
        throw new ConflictException("This delivery cannot be retried");
      if (row.status === "uncertain" && !confirmedNotSent)
        throw new ConflictException(
          "Verify that the provider did not send the message before retrying",
        );
      const changed = await tx.contractDelivery.updateMany({
        where: { id, status: row.status, attempts: row.attempts },
        data: {
          status: "queued",
          nextRunAt: new Date(),
          leaseUntil: null,
          attempts: 0,
        },
      });
      if (!changed.count) throw new ConflictException("Delivery changed");
      await this.support.event(
        tx,
        userId,
        row.packageId,
        "delivery.retry_authorized",
        { deliveryId: id, confirmedNotSent, reason },
      );
    });
    return { id, status: "queued" };
  }
}
