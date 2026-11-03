import { z } from "zod";

export const NOTIFICATION_CATEGORIES = [
  "scooters",
  "rentals",
  "persons",
  "access",
  "jobs",
  "expenses",
  "brands",
  "other",
] as const;
export const notificationCategorySchema = z.enum(NOTIFICATION_CATEGORIES);
export type NotificationCategory = z.infer<typeof notificationCategorySchema>;
export const notificationSubjectTypeSchema = z.enum([
  "scooter",
  "rental",
  "person",
  "user",
  "role",
  "issue",
  "todo",
  "expense",
  "brand",
  "location",
  "supplier",
  "finance",
  "contract",
]);
export const notificationScooterSchema = z.object({
  id: z.string(),
  fleetNumber: z.number().int().nonnegative(),
  brandCode: z.string(),
});
export const notificationSchema = z
  .object({
    id: z.string(),
    eventId: z.string(),
    type: z.string().regex(/^[a-z]+(?:[._][a-z]+)*$/),
    category: notificationCategorySchema,
    actorName: z.string(),
    actorIsSystem: z.boolean().optional(),
    subjectType: notificationSubjectTypeSchema,
    subjectId: z.string(),
    subjectLabel: z.string(),
    targetPath: z
      .string()
      .regex(/^\/(?!\/)/)
      .nullable(),
    scooter: notificationScooterSchema.nullable(),
    changes: z.array(z.string()),
    reason: z.enum(["activity", "assigned", "unassigned"]),
    createdAt: z.iso.datetime(),
    readAt: z.iso.datetime().nullable(),
    presentedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: "Notification" });
export type Notification = z.infer<typeof notificationSchema>;
export const notificationListSchema = z
  .object({
    items: z.array(notificationSchema),
    nextCursor: z.string().nullable(),
    unreadCount: z.number().int().nonnegative(),
    cutoff: z.iso.datetime(),
  })
  .meta({ id: "NotificationList" });
export type NotificationList = z.infer<typeof notificationListSchema>;
const queryBoolean = z.enum(["true", "false"]).transform((v) => v === "true");
export const listNotificationsQuerySchema = z
  .object({
    cursor: z.string().max(1000).optional(),
    category: notificationCategorySchema.optional(),
    unreadOnly: queryBoolean.optional(),
    pending: queryBoolean.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  })
  .strict()
  .meta({ id: "ListNotificationsQuery" });
export type ListNotificationsQuery = z.infer<
  typeof listNotificationsQuerySchema
>;
export const markNotificationReadInputSchema = z
  .object({})
  .strict()
  .meta({ id: "MarkNotificationReadInput" });
export const markAllNotificationsReadInputSchema = z
  .object({
    cutoff: z.iso.datetime(),
  })
  .strict()
  .meta({ id: "MarkAllNotificationsReadInput" });
export const presentNotificationsInputSchema = z
  .object({
    ids: z.array(z.string().min(1).max(200)).min(1).max(100),
  })
  .strict()
  .meta({ id: "PresentNotificationsInput" });
export const notificationPreferencesSchema = z
  .object({
    pushEnabled: z.boolean(),
    mutedCategories: z.array(notificationCategorySchema),
  })
  .meta({ id: "NotificationPreferences" });
export type NotificationPreferences = z.infer<
  typeof notificationPreferencesSchema
>;
export const updateNotificationPreferencesInputSchema =
  notificationPreferencesSchema
    .strict()
    .meta({ id: "UpdateNotificationPreferencesInput" });
export const pushConfigSchema = z
  .object({
    configured: z.boolean(),
    publicKey: z.string().nullable(),
  })
  .meta({ id: "NotificationPushConfig" });
export type PushConfig = z.infer<typeof pushConfigSchema>;
// Push endpoints are provider capability URLs, never arbitrary callback URLs.
// The API additionally restricts hosts before making an outbound request.
export const registerPushSubscriptionInputSchema = z
  .object({
    endpoint: z
      .url()
      .max(4096)
      .refine(
        (v) => new URL(v).protocol === "https:",
        "Push endpoints must use HTTPS",
      ),
    keys: z
      .object({
        p256dh: z
          .string()
          .regex(/^[A-Za-z0-9_-]+={0,2}$/)
          .min(80)
          .max(100),
        auth: z
          .string()
          .regex(/^[A-Za-z0-9_-]+={0,2}$/)
          .min(20)
          .max(32),
      })
      .strict(),
    locale: z.enum(["en", "ro"]),
  })
  .strict()
  .meta({ id: "RegisterNotificationPushSubscriptionInput" });
export type RegisterPushSubscriptionInput = z.infer<
  typeof registerPushSubscriptionInputSchema
>;
export const removePushSubscriptionInputSchema = z
  .object({
    endpoint: z.url().max(4096),
  })
  .strict()
  .meta({ id: "RemoveNotificationPushSubscriptionInput" });
export const notificationMutationResultSchema = z
  .object({
    ok: z.literal(true),
  })
  .meta({ id: "NotificationMutationResult" });
const notificationProcessingFailureSchema = z.object({
  id: z.string(),
  attempts: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
});
export const notificationProcessingFailuresSchema = z
  .object({
    events: z.array(notificationProcessingFailureSchema),
    deliveries: z.array(notificationProcessingFailureSchema),
  })
  .meta({ id: "NotificationProcessingFailures" });
export type NotificationProcessingFailures = z.infer<
  typeof notificationProcessingFailuresSchema
>;
export const ROUTES = {
  list: "/v1/notifications",
  detail: (id: string) => `/v1/notifications/${encodeURIComponent(id)}`,
  processing: "/v1/notifications/processing",
  retryEvent: (id: string) =>
    `/v1/notifications/processing/events/${encodeURIComponent(id)}/retry`,
  retryDelivery: (id: string) =>
    `/v1/notifications/processing/deliveries/${encodeURIComponent(id)}/retry`,
  activity: "/v1/notifications/activity",
  readAll: "/v1/notifications/read-all",
  presented: "/v1/notifications/presented",
  preferences: "/v1/notifications/preferences",
  pushConfig: "/v1/notifications/push-config",
  pushSubscriptions: "/v1/notifications/push-subscriptions",
  read: (id: string) => `/v1/notifications/${encodeURIComponent(id)}/read`,
} as const;
