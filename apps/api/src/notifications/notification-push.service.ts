import { createHash, ECDH } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import webPush from "web-push";
import { v1 } from "@repo/api-shared";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";

/** Only public browser push providers may become outbound destinations. */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443") ||
      url.hash
    )
      return false;
    const host = url.hostname.toLowerCase();
    return (
      host === "fcm.googleapis.com" ||
      host === "android.googleapis.com" ||
      host.endsWith(".push.services.mozilla.com") ||
      host.endsWith(".push.apple.com") ||
      host.endsWith(".notify.windows.com")
    );
  } catch {
    return false;
  }
}

export const pushEndpointHash = (endpoint: string) =>
  createHash("sha256").update(endpoint).digest("hex");

export function validatePushSubscription(
  input: v1.notifications.RegisterPushSubscriptionInput,
): void {
  const publicKey = Buffer.from(input.keys.p256dh, "base64url");
  const auth = Buffer.from(input.keys.auth, "base64url");
  let validPoint = false;
  try {
    ECDH.convertKey(publicKey, "prime256v1");
    validPoint = true;
  } catch {
    // Invalid curve points must fail registration, before any send is queued.
  }
  if (
    !isAllowedPushEndpoint(input.endpoint) ||
    publicKey.length !== 65 ||
    publicKey[0] !== 4 ||
    !validPoint ||
    auth.length !== 16
  )
    throw new BadRequestException("Invalid browser push subscription");
}

export interface BrowserPushPayload {
  notificationId: string;
  title: string;
  body: string;
  url: string;
  tag: string;
}

@Injectable()
export class NotificationPushService {
  constructor(@Inject(ENV) private readonly env: Env) {}

  get config(): v1.notifications.PushConfig {
    const configured = !!(
      this.env.NOTIFICATIONS_VAPID_PUBLIC_KEY &&
      this.env.NOTIFICATIONS_VAPID_PRIVATE_KEY &&
      this.env.NOTIFICATIONS_VAPID_SUBJECT
    );
    return {
      configured,
      publicKey: configured
        ? (this.env.NOTIFICATIONS_VAPID_PUBLIC_KEY ?? null)
        : null,
    };
  }

  async send(
    subscription: { endpoint: string; p256dh: string; auth: string },
    payload: BrowserPushPayload,
  ): Promise<void> {
    if (!this.config.configured) throw new Error("PUSH_NOT_CONFIGURED");
    if (!isAllowedPushEndpoint(subscription.endpoint))
      throw new Error("INVALID_PUSH_ENDPOINT");
    await webPush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
      {
        vapidDetails: {
          subject: this.env.NOTIFICATIONS_VAPID_SUBJECT,
          publicKey: this.env.NOTIFICATIONS_VAPID_PUBLIC_KEY,
          privateKey: this.env.NOTIFICATIONS_VAPID_PRIVATE_KEY,
        },
        TTL: 3600,
        urgency: "normal",
        timeout: 10_000,
      },
    );
  }
}
