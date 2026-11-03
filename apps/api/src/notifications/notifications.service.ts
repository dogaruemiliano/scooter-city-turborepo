import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";
import { AccessService } from "../access/access.service";
import type { NotificationEvent, Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { activityEventWhere, notificationWhere } from "./notification-policy";
import {
  notificationCursor,
  parseNotificationCursor,
  projectNotification,
} from "./notification-projection";
import {
  NotificationPushService,
  pushEndpointHash,
  validatePushSubscription,
} from "./notification-push.service";
import {
  NOTIFICATION_MAX_EVENT_ATTEMPTS,
  NOTIFICATION_MAX_PUSH_ATTEMPTS,
} from "./notification.constants";

const success = { ok: true } as const;
const includeEvent = { event: true } as const;
const order = [{ createdAt: "desc" }, { id: "desc" }] as const;

function cursorWhere(cursor?: string) {
  if (!cursor) return {};
  const parsed = parseNotificationCursor(cursor);
  if (!parsed) throw new BadRequestException("Invalid notification cursor");
  return {
    OR: [
      { createdAt: { lt: parsed.createdAt } },
      { createdAt: parsed.createdAt, id: { lt: parsed.id } },
    ],
  };
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly push: NotificationPushService,
  ) {}

  async list(
    userId: string,
    query: v1.notifications.ListNotificationsQuery,
  ): Promise<v1.notifications.NotificationList> {
    const snapshot = await this.access.getSnapshot(userId);
    const cutoff = new Date();
    const visible = notificationWhere(snapshot);
    const where: Prisma.NotificationWhereInput = {
      AND: [
        visible,
        { createdAt: { lte: cutoff } },
        cursorWhere(query.cursor),
        ...(query.category
          ? [{ event: { is: { category: query.category } } }]
          : []),
        ...(query.unreadOnly || query.pending ? [{ readAt: null }] : []),
        ...(query.pending
          ? [
              { presentedAt: null },
              { createdAt: { gte: new Date(cutoff.getTime() - 5 * 60_000) } },
            ]
          : []),
      ],
    };
    const [rows, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        include: includeEvent,
        orderBy: [...order],
        take: query.limit + 1,
      }),
      this.prisma.notification.count({
        where: { AND: [visible, { readAt: null }] },
      }),
    ]);
    const page = rows.slice(0, query.limit);
    const available = await this.availableTargets(
      page.map(({ event }) => event),
    );
    return {
      items: page.map((row) =>
        projectNotification(row.event, row, available.has(row.event.id)),
      ),
      nextCursor:
        rows.length > query.limit && page.length
          ? notificationCursor(page[page.length - 1])
          : null,
      unreadCount,
      cutoff: cutoff.toISOString(),
    };
  }

  async detail(
    userId: string,
    id: string,
  ): Promise<v1.notifications.Notification> {
    const snapshot = await this.access.getSnapshot(userId);
    const row = await this.prisma.notification.findFirst({
      where: { AND: [notificationWhere(snapshot), { id }] },
      include: includeEvent,
    });
    if (!row) throw new NotFoundException("Notification not found");
    const available = await this.availableTargets([row.event]);
    return projectNotification(row.event, row, available.has(row.event.id));
  }

  async activity(
    userId: string,
    query: v1.notifications.ListNotificationsQuery,
  ): Promise<v1.notifications.NotificationList> {
    const snapshot = await this.access.getSnapshot(userId);
    if (
      !snapshot.isSuperAdmin &&
      !snapshot.effectiveScopes["notifications.activity.read"]?.includes("ALL")
    )
      throw new ForbiddenException("Permission required");
    const cutoff = new Date();
    const rows = await this.prisma.notificationEvent.findMany({
      where: {
        AND: [
          activityEventWhere(snapshot),
          { createdAt: { lte: cutoff } },
          cursorWhere(query.cursor),
          ...(query.category ? [{ category: query.category }] : []),
        ],
      },
      orderBy: [...order],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const available = await this.availableTargets(page);
    return {
      items: page.map((event) =>
        projectNotification(event, undefined, available.has(event.id)),
      ),
      nextCursor:
        rows.length > query.limit && page.length
          ? notificationCursor(page[page.length - 1])
          : null,
      unreadCount: 0,
      cutoff: cutoff.toISOString(),
    };
  }

  async markRead(userId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const snapshot = await this.access.getSnapshot(userId, tx);
      const where: Prisma.NotificationWhereInput = {
        AND: [notificationWhere(snapshot), { id }],
      };
      const exists = await tx.notification.findFirst({
        where,
        select: { id: true },
      });
      if (!exists) throw new NotFoundException("Notification not found");
      await tx.notification.updateMany({
        where: { AND: [where, { readAt: null }] },
        data: { readAt: new Date() },
      });
      await tx.notificationDelivery.updateMany({
        where: { notificationId: id, status: "pending" },
        data: { status: "cancelled" },
      });
    });
    return success;
  }

  async markAllRead(userId: string, cutoffInput: string) {
    const now = new Date();
    const cutoff = new Date(
      Math.min(new Date(cutoffInput).getTime(), now.getTime()),
    );
    await this.prisma.$transaction(async (tx) => {
      const snapshot = await this.access.getSnapshot(userId, tx);
      const where: Prisma.NotificationWhereInput = {
        AND: [notificationWhere(snapshot), { createdAt: { lte: cutoff } }],
      };
      await tx.notification.updateMany({
        where: { AND: [where, { readAt: null }] },
        data: { readAt: now },
      });
      await tx.notificationDelivery.updateMany({
        where: { notification: { is: where }, status: "pending" },
        data: { status: "cancelled" },
      });
    });
    return success;
  }

  async presented(userId: string, ids: string[]) {
    await this.prisma.$transaction(async (tx) => {
      const snapshot = await this.access.getSnapshot(userId, tx);
      const where: Prisma.NotificationWhereInput = {
        AND: [notificationWhere(snapshot), { id: { in: [...new Set(ids)] } }],
      };
      await tx.notification.updateMany({
        where: { AND: [where, { presentedAt: null }] },
        data: { presentedAt: new Date() },
      });
      await tx.notificationDelivery.updateMany({
        where: { notification: { is: where }, status: "pending" },
        data: { status: "cancelled" },
      });
    });
    return success;
  }

  async preferences(
    userId: string,
  ): Promise<v1.notifications.NotificationPreferences> {
    await this.access.getSnapshot(userId);
    const row = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });
    return {
      pushEnabled: row?.pushEnabled ?? true,
      mutedCategories: v1.notifications.NOTIFICATION_CATEGORIES.filter(
        (category) => row?.mutedCategories.includes(category),
      ),
    };
  }

  async updatePreferences(
    userId: string,
    input: v1.notifications.NotificationPreferences,
  ): Promise<v1.notifications.NotificationPreferences> {
    await this.access.getSnapshot(userId);
    const normalized = {
      pushEnabled: input.pushEnabled,
      mutedCategories: [...new Set(input.mutedCategories)],
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.notificationPreference.upsert({
        where: { userId },
        create: { userId, ...normalized },
        update: normalized,
      });
      await tx.notificationDelivery.updateMany({
        where: {
          status: "pending",
          notification: {
            is: {
              recipientId: userId,
              ...(normalized.pushEnabled
                ? {
                    event: {
                      is: { category: { in: normalized.mutedCategories } },
                    },
                  }
                : {}),
            },
          },
        },
        data: { status: "cancelled" },
      });
    });
    return normalized;
  }

  pushConfig() {
    return this.push.config;
  }

  async registerSubscription(
    userId: string,
    sessionId: string,
    input: v1.notifications.RegisterPushSubscriptionInput,
  ) {
    await this.access.getSnapshot(userId);
    if (!this.push.config.configured)
      throw new ServiceUnavailableException(
        "Push notifications are not configured",
      );
    validatePushSubscription(input);
    const session = await this.prisma.session.findFirst({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
        refreshTokens: {
          some: { revokedAt: null, expiresAt: { gt: new Date() } },
        },
      },
      select: { id: true },
    });
    if (!session) throw new ForbiddenException("Session is not active");
    const data = {
      userId,
      sessionId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      locale: input.locale,
      revokedAt: null,
    };
    await this.prisma.notificationPushSubscription.upsert({
      where: { endpointHash: pushEndpointHash(input.endpoint) },
      create: { endpointHash: pushEndpointHash(input.endpoint), ...data },
      update: data,
    });
    return success;
  }

  async removeSubscription(userId: string, endpoint: string) {
    await this.access.getSnapshot(userId);
    await this.prisma.notificationPushSubscription.updateMany({
      where: {
        userId,
        endpointHash: pushEndpointHash(endpoint),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    return success;
  }

  private async requireOperator(userId: string) {
    const snapshot = await this.access.getSnapshot(userId);
    if (!snapshot.isSuperAdmin)
      throw new ForbiddenException("Super admin required");
  }

  async processingFailures(
    userId: string,
  ): Promise<v1.notifications.NotificationProcessingFailures> {
    await this.requireOperator(userId);
    const now = new Date();
    const [events, deliveries] = await Promise.all([
      this.prisma.notificationEvent.findMany({
        where: {
          processedAt: null,
          attempts: { gte: NOTIFICATION_MAX_EVENT_ATTEMPTS },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
        },
        select: { id: true, attempts: true, lastError: true },
        orderBy: { createdAt: "asc" },
        take: 100,
      }),
      this.prisma.notificationDelivery.findMany({
        where: {
          OR: [
            { status: "failed" },
            {
              status: "sending",
              attempts: { gte: NOTIFICATION_MAX_PUSH_ATTEMPTS },
              leaseUntil: { lt: now },
            },
          ],
        },
        select: { id: true, attempts: true, lastError: true },
        orderBy: { availableAt: "asc" },
        take: 100,
      }),
    ]);
    return { events, deliveries };
  }

  async retryEvent(userId: string, id: string) {
    await this.requireOperator(userId);
    const now = new Date();
    const updated = await this.prisma.notificationEvent.updateMany({
      where: {
        id,
        processedAt: null,
        attempts: { gte: NOTIFICATION_MAX_EVENT_ATTEMPTS },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      data: {
        attempts: 0,
        availableAt: now,
        leaseId: null,
        leaseUntil: null,
        lastError: null,
      },
    });
    if (!updated.count)
      throw new ConflictException("Event is not available for retry");
    return success;
  }

  async retryDelivery(userId: string, id: string) {
    await this.requireOperator(userId);
    const now = new Date();
    const updated = await this.prisma.notificationDelivery.updateMany({
      where: {
        id,
        AND: [
          {
            OR: [
              { status: "failed" },
              {
                status: "sending",
                attempts: { gte: NOTIFICATION_MAX_PUSH_ATTEMPTS },
              },
            ],
          },
          { OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
        ],
      },
      data: {
        status: "pending",
        attempts: 0,
        availableAt: now,
        leaseId: null,
        leaseUntil: null,
        lastError: null,
      },
    });
    if (!updated.count)
      throw new ConflictException("Delivery is not available for retry");
    return success;
  }

  /** Resolve target existence in batches, without exposing unauthorized rows. */
  private async availableTargets(
    events: NotificationEvent[],
  ): Promise<Set<string>> {
    const ids = (subject: string) =>
      events
        .filter((event) => event.subjectType === subject)
        .map((event) => event.subjectId);
    const lookups = [
      [
        "scooter",
        () =>
          this.prisma.scooter.findMany({
            where: { id: { in: ids("scooter") }, deletedAt: null },
            select: { id: true },
          }),
      ],
      [
        "person",
        () =>
          this.prisma.person.findMany({
            where: { id: { in: ids("person") }, deletedAt: null },
            select: { id: true },
          }),
      ],
      [
        "brand",
        () =>
          this.prisma.scooterBrand.findMany({
            where: { id: { in: ids("brand") } },
            select: { id: true },
          }),
      ],
      [
        "user",
        () =>
          this.prisma.user.findMany({
            where: { id: { in: ids("user") }, deletedAt: null },
            select: { id: true },
          }),
      ],
      [
        "role",
        () =>
          this.prisma.role.findMany({
            where: { id: { in: ids("role") }, archivedAt: null },
            select: { id: true },
          }),
      ],
      [
        "issue",
        () =>
          this.prisma.scooterProblem.findMany({
            where: {
              id: { in: ids("issue") },
              scooter: { is: { deletedAt: null } },
            },
            select: { id: true },
          }),
      ],
      [
        "todo",
        () =>
          this.prisma.scooterProblem.findMany({
            where: { id: { in: ids("todo") }, scooterId: null },
            select: { id: true },
          }),
      ],
    ] as const;
    const unavailable = new Set<string>();
    await Promise.all(
      lookups.map(async ([subject, lookup]) => {
        const relevant = events.filter(
          (event) => event.subjectType === subject,
        );
        if (!relevant.length) return;
        const existing = new Set((await lookup()).map(({ id }) => id));
        for (const event of relevant)
          if (!existing.has(event.subjectId)) unavailable.add(event.id);
      }),
    );
    return new Set(
      events.filter((event) => !unavailable.has(event.id)).map(({ id }) => id),
    );
  }
}
