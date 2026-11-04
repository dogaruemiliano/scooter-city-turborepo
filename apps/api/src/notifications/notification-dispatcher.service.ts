import { randomUUID } from "node:crypto";
import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { formatNotificationMessage } from "@repo/i18n";
import { AccessService } from "../access/access.service";
import { PrismaService } from "../prisma/prisma.service";
import type { Prisma } from "../generated/prisma/client";
import {
  canReceiveRemovalNotice,
  hasNotificationScope,
  notificationEventWhere,
  notificationUserInclude,
  notificationWhere,
  snapshotForNotificationUser,
} from "./notification-policy";
import { projectNotification } from "./notification-projection";
import { NotificationPushService } from "./notification-push.service";
import {
  NOTIFICATION_PUSH_GRACE_MS,
  NOTIFICATION_LEASE_MS,
  NOTIFICATION_MAX_EVENT_ATTEMPTS,
  NOTIFICATION_MAX_PUSH_ATTEMPTS,
} from "./notification.constants";
export {
  NOTIFICATION_PUSH_GRACE_MS,
  NOTIFICATION_LEASE_MS,
  NOTIFICATION_MAX_EVENT_ATTEMPTS,
  NOTIFICATION_MAX_PUSH_ATTEMPTS,
} from "./notification.constants";

const PUSH_MAX_AGE_MS = 24 * 60 * 60_000;

export const notificationRetryDelay = (attempt: number) =>
  Math.min(60 * 60_000, 1000 * 2 ** Math.min(attempt, 12));

function providerStatus(error: unknown): number | undefined {
  if (
    error &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  )
    return error.statusCode;
  return undefined;
}

@Injectable()
export class NotificationDispatcherService {
  private readonly logger = new Logger(NotificationDispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly push: NotificationPushService,
  ) {}

  @Cron("* * * * * *", {
    name: "notification-dispatch",
    waitForCompletion: true,
  })
  async tick() {
    try {
      await this.runOnce();
    } catch {
      this.logger.error(
        "Notification dispatcher failed; durable work remains queued",
      );
    }
  }

  async runOnce() {
    await this.dispatchEvents();
    await this.dispatchPush();
  }

  private async dispatchEvents() {
    const now = new Date();
    const claimable: Prisma.NotificationEventWhereInput = {
      processedAt: null,
      attempts: { lt: NOTIFICATION_MAX_EVENT_ATTEMPTS },
      availableAt: { lte: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    };
    const events = await this.prisma.notificationEvent.findMany({
      where: claimable,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 20,
    });
    for (const event of events) {
      const leaseId = randomUUID();
      const claim = await this.prisma.notificationEvent.updateMany({
        where: { AND: [claimable, { id: event.id }] },
        data: {
          leaseId,
          leaseUntil: new Date(Date.now() + NOTIFICATION_LEASE_MS),
          attempts: { increment: 1 },
        },
      });
      if (!claim.count) continue;
      try {
        await this.prisma.$transaction(
          async (tx) => {
            const current = await tx.notificationEvent.findFirst({
              where: {
                id: event.id,
                leaseId,
                leaseUntil: { gt: new Date() },
                processedAt: null,
              },
            });
            if (!current) return;
            const ids = [
              ...new Set([
                ...current.adminRecipientIds,
                ...current.assignedRecipientIds,
                ...current.removedRecipientIds,
              ]),
            ].filter(
              (id) =>
                id !== current.actorId ||
                current.type === "issue.reminder" ||
                current.type === "todo.reminder",
            );
            const candidates = await tx.user.findMany({
              where: {
                id: { in: ids },
                deletedAt: null,
                loginStatus: "ACTIVE",
              },
              include: notificationUserInclude,
            });
            for (const user of candidates) {
              const snapshot = snapshotForNotificationUser(user);
              let reason: "activity" | "assigned" | "unassigned" | undefined;
              const detailed = await tx.notificationEvent.count({
                where: {
                  AND: [{ id: current.id }, notificationEventWhere(snapshot)],
                },
              });
              if (
                detailed &&
                current.adminRecipientIds.includes(user.id) &&
                hasNotificationScope(snapshot, "ALL")
              )
                reason = "activity";
              else if (
                detailed &&
                current.assignedRecipientIds.includes(user.id) &&
                (hasNotificationScope(snapshot, "ALL") ||
                  hasNotificationScope(snapshot, "ASSIGNED"))
              )
                reason = "assigned";
              else if (
                current.removedRecipientIds.includes(user.id) &&
                canReceiveRemovalNotice(snapshot)
              )
                reason = "unassigned";
              if (!reason) continue;
              const notification = await tx.notification.upsert({
                where: {
                  eventId_recipientId: {
                    eventId: current.id,
                    recipientId: user.id,
                  },
                },
                create: { eventId: current.id, recipientId: user.id, reason },
                update: {},
              });
              if (
                notification.readAt ||
                notification.presentedAt ||
                !this.push.config.configured
              )
                continue;
              const preference = await tx.notificationPreference.findUnique({
                where: { userId: user.id },
              });
              if (
                preference &&
                (!preference.pushEnabled ||
                  preference.mutedCategories.includes(current.category))
              )
                continue;
              const subscriptions =
                await tx.notificationPushSubscription.findMany({
                  where: {
                    userId: user.id,
                    revokedAt: null,
                    session: {
                      is: {
                        userId: user.id,
                        revokedAt: null,
                        refreshTokens: {
                          some: {
                            revokedAt: null,
                            expiresAt: { gt: new Date() },
                          },
                        },
                      },
                    },
                  },
                  select: { id: true },
                });
              if (subscriptions.length)
                await tx.notificationDelivery.createMany({
                  data: subscriptions.map(({ id }) => ({
                    notificationId: notification.id,
                    subscriptionId: id,
                    availableAt: new Date(
                      notification.createdAt.getTime() +
                        NOTIFICATION_PUSH_GRACE_MS,
                    ),
                  })),
                  skipDuplicates: true,
                });
            }
            const completed = await tx.notificationEvent.updateMany({
              where: {
                id: current.id,
                leaseId,
                leaseUntil: { gt: new Date() },
              },
              data: {
                processedAt: new Date(),
                leaseId: null,
                leaseUntil: null,
                lastError: null,
              },
            });
            if (!completed.count)
              throw new Error("NOTIFICATION_EVENT_LEASE_LOST");
          },
          { timeout: 15_000 },
        );
      } catch {
        await this.prisma.notificationEvent.updateMany({
          where: { id: event.id, leaseId },
          data: {
            leaseId: null,
            leaseUntil: null,
            lastError: "NOTIFICATION_EVENT_PROCESSING_FAILED",
            availableAt: new Date(
              Date.now() + notificationRetryDelay(event.attempts + 1),
            ),
          },
        });
        this.logger.error(
          { eventId: event.id },
          "Notification event processing failed",
        );
      }
    }
  }

  private async dispatchPush() {
    const now = new Date();
    // Persisted destinations outlive tabs; remove ownership when their session ends.
    await this.prisma.notificationPushSubscription.updateMany({
      where: {
        revokedAt: null,
        session: {
          is: {
            OR: [
              { revokedAt: { not: null } },
              {
                refreshTokens: {
                  none: { revokedAt: null, expiresAt: { gt: now } },
                },
              },
            ],
          },
        },
      },
      data: { revokedAt: now },
    });
    if (!this.push.config.configured) return;
    const claimable: Prisma.NotificationDeliveryWhereInput = {
      status: { in: ["pending", "sending"] },
      availableAt: { lte: now },
      attempts: { lt: NOTIFICATION_MAX_PUSH_ATTEMPTS },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    };
    const deliveries = await this.prisma.notificationDelivery.findMany({
      where: claimable,
      orderBy: [{ availableAt: "asc" }, { id: "asc" }],
      take: 20,
    });
    // Keep outbound requests bounded; each request also has its own timeout.
    for (let start = 0; start < deliveries.length; start += 4)
      await Promise.all(
        deliveries.slice(start, start + 4).map(async (delivery) => {
          const leaseId = randomUUID();
          const claim = await this.prisma.notificationDelivery.updateMany({
            where: { AND: [claimable, { id: delivery.id }] },
            data: {
              status: "sending",
              leaseId,
              leaseUntil: new Date(Date.now() + NOTIFICATION_LEASE_MS),
              attempts: { increment: 1 },
            },
          });
          if (!claim.count) return;
          try {
            await this.sendDelivery(delivery.id, leaseId);
          } catch (error) {
            const status = providerStatus(error);
            const expired = status === 404 || status === 410;
            const terminal =
              expired ||
              (status !== undefined &&
                status >= 400 &&
                status < 500 &&
                status !== 408 &&
                status !== 429);
            if (expired)
              await this.prisma.notificationPushSubscription.updateMany({
                where: { id: delivery.subscriptionId },
                data: { revokedAt: new Date() },
              });
            await this.prisma.notificationDelivery.updateMany({
              where: { id: delivery.id, leaseId },
              data: {
                status:
                  terminal ||
                  delivery.attempts + 1 >= NOTIFICATION_MAX_PUSH_ATTEMPTS
                    ? "failed"
                    : "pending",
                leaseId: null,
                leaseUntil: null,
                availableAt: new Date(
                  Date.now() + notificationRetryDelay(delivery.attempts + 1),
                ),
                lastError: status
                  ? `PUSH_PROVIDER_${status}`
                  : "PUSH_PROVIDER_REQUEST_FAILED",
              },
            });
            this.logger.warn(
              { deliveryId: delivery.id, providerStatus: status },
              "Notification push attempt failed",
            );
          }
        }),
      );
  }

  private async sendDelivery(id: string, leaseId: string) {
    const row = await this.prisma.notificationDelivery.findFirst({
      where: { id, leaseId, status: "sending", leaseUntil: { gt: new Date() } },
      include: {
        notification: { include: { event: true } },
        subscription: { include: { session: true } },
      },
    });
    if (!row) return;
    const finish = (status: "cancelled" | "accepted") =>
      this.prisma.notificationDelivery.updateMany({
        where: { id, leaseId },
        data: {
          status,
          leaseId: null,
          leaseUntil: null,
          ...(status === "accepted"
            ? { acceptedAt: new Date(), lastError: null }
            : {}),
        },
      });
    const { notification, subscription } = row;
    if (
      notification.readAt ||
      notification.presentedAt ||
      subscription.revokedAt ||
      subscription.session.revokedAt ||
      subscription.userId !== notification.recipientId ||
      subscription.session.userId !== notification.recipientId ||
      notification.createdAt.getTime() < Date.now() - PUSH_MAX_AGE_MS
    ) {
      await finish("cancelled");
      return;
    }
    let visible: boolean;
    try {
      const snapshot = await this.access.getSnapshot(notification.recipientId);
      visible = !!(await this.prisma.notification.findFirst({
        where: {
          AND: [
            notificationWhere(snapshot),
            { id: notification.id, readAt: null, presentedAt: null },
          ],
        },
        select: { id: true },
      }));
    } catch (error) {
      // An inactive account is terminal; transient storage errors remain retryable.
      if (error instanceof ForbiddenException) visible = false;
      else throw error;
    }
    const [preference, sessionValid] = await Promise.all([
      this.prisma.notificationPreference.findUnique({
        where: { userId: notification.recipientId },
      }),
      this.prisma.session.count({
        where: {
          id: subscription.sessionId,
          userId: notification.recipientId,
          revokedAt: null,
          refreshTokens: {
            some: { revokedAt: null, expiresAt: { gt: new Date() } },
          },
        },
      }),
    ]);
    if (
      !visible ||
      !sessionValid ||
      (preference &&
        (!preference.pushEnabled ||
          preference.mutedCategories.includes(notification.event.category)))
    ) {
      await finish("cancelled");
      return;
    }
    const locale = subscription.locale === "ro" ? "ro" : "en";
    const projected = projectNotification(notification.event, notification);
    const message = formatNotificationMessage(locale, projected);
    await this.push.send(subscription, {
      notificationId: notification.id,
      ...message,
      url: `/${locale}/notifications?open=${encodeURIComponent(notification.id)}`,
      tag: notification.id,
    });
    await finish("accepted");
  }
}
