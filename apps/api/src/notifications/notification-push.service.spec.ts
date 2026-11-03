import { createECDH, randomBytes } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import type { Env } from "../config/env";
import {
  isAllowedPushEndpoint,
  NotificationPushService,
  pushEndpointHash,
  validatePushSubscription,
} from "./notification-push.service";

describe("browser push destination boundary", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/token",
    "https://android.googleapis.com/gcm/send/token",
    "https://updates.push.services.mozilla.com/wpush/v2/token",
    "https://web.push.apple.com/Q/token",
    "https://wns2-par02p.notify.windows.com/w/?token=x",
  ])("accepts the supported public provider %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    "http://fcm.googleapis.com/fcm/send/token",
    "https://127.0.0.1/private",
    "https://[::1]/private",
    "https://169.254.169.254/latest/meta-data/",
    "https://fcm.googleapis.com.attacker.example/token",
    "https://attacker.example/?next=https://fcm.googleapis.com/token",
    "https://user:secret@fcm.googleapis.com/token",
    "https://fcm.googleapis.com:8443/token",
    "https://fcm.googleapis.com/token#fragment",
    "https://push.services.mozilla.com.attacker.example/token",
    "file:///private/token",
    "not a URL",
  ])("rejects an arbitrary/ambiguous outbound URL %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });

  it("validates browser key lengths before persisting a destination", () => {
    const curve = createECDH("prime256v1");
    const publicKey = curve.generateKeys();
    const subscription = {
      endpoint: "https://fcm.googleapis.com/fcm/send/token",
      keys: {
        p256dh: publicKey.toString("base64url"),
        auth: randomBytes(16).toString("base64url"),
      },
      locale: "en" as const,
    };
    expect(() => validatePushSubscription(subscription)).not.toThrow();
    expect(() =>
      validatePushSubscription({
        ...subscription,
        keys: {
          ...subscription.keys,
          auth: randomBytes(15).toString("base64url"),
        },
      }),
    ).toThrow(BadRequestException);
    const invalidPoint = Buffer.alloc(65);
    invalidPoint[0] = 4;
    expect(() =>
      validatePushSubscription({
        ...subscription,
        keys: {
          ...subscription.keys,
          p256dh: invalidPoint.toString("base64url"),
        },
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      validatePushSubscription({
        ...subscription,
        keys: {
          ...subscription.keys,
          p256dh: randomBytes(64).toString("base64url"),
        },
      }),
    ).toThrow(BadRequestException);
  });

  it("uses a stable hash without exposing the capability URL as an identifier", () => {
    const endpoint = "https://fcm.googleapis.com/fcm/send/token";
    expect(pushEndpointHash(endpoint)).toMatch(/^[a-f0-9]{64}$/);
    expect(pushEndpointHash(endpoint)).toBe(pushEndpointHash(endpoint));
    expect(pushEndpointHash(`${endpoint}-different`)).not.toBe(
      pushEndpointHash(endpoint),
    );
  });

  it("reports push unavailable unless the full VAPID tuple is configured", () => {
    const env = {
      NOTIFICATIONS_VAPID_PUBLIC_KEY: "public",
      NOTIFICATIONS_VAPID_PRIVATE_KEY: "",
      NOTIFICATIONS_VAPID_SUBJECT: "mailto:operations@example.com",
    } as Env;
    expect(new NotificationPushService(env).config).toEqual({
      configured: false,
      publicKey: null,
    });
    expect(
      new NotificationPushService({
        ...env,
        NOTIFICATIONS_VAPID_PRIVATE_KEY: "private",
      }).config,
    ).toEqual({ configured: true, publicKey: "public" });
  });
});
