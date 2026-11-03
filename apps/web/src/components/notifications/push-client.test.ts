import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { v1 } from "@repo/api-shared";
import { synchronizePushSubscription } from "./push-client";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ webApi: { fetch: mocks.fetch } }));

const unsubscribe = vi.fn().mockResolvedValue(true);
const requestPermission = vi.fn();
const endpoint = "https://fcm.googleapis.com/fcm/send/example";
const keys = { p256dh: "A".repeat(87), auth: "B".repeat(22) };
const subscription = {
  endpoint,
  toJSON: () => ({ endpoint, keys }),
  unsubscribe,
};

beforeEach(() => {
  mocks.fetch.mockReset();
  unsubscribe.mockClear();
  requestPermission.mockReset();
  mocks.fetch.mockImplementation((path: string) =>
    Promise.resolve(
      path === v1.notifications.ROUTES.pushConfig
        ? { configured: true, publicKey: "public" }
        : { ok: true },
    ),
  );
  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    value: true,
  });
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("Notification", { permission: "granted", requestPermission });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistration: vi.fn().mockResolvedValue({
        active: { scriptURL: "http://localhost/notifications-sw.js" },
        pushManager: {
          getSubscription: vi.fn().mockResolvedValue(subscription),
        },
      }),
    },
  });
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("existing push ownership", () => {
  it("rebinds same-account subscriptions to the current authenticated session without prompting", async () => {
    localStorage.setItem("scooter-notifications-owner:v1", "user-1");
    await synchronizePushSubscription("user-1", "ro");
    expect(requestPermission).not.toHaveBeenCalled();
    expect(unsubscribe).not.toHaveBeenCalled();
    expect(mocks.fetch).toHaveBeenCalledWith(
      v1.notifications.ROUTES.pushSubscriptions,
      expect.anything(),
      { method: "POST", json: { endpoint, keys, locale: "ro" } },
    );
  });

  it("unsubscribes the prior account's destination instead of rebinding it", async () => {
    localStorage.setItem("scooter-notifications-owner:v1", "previous-user");
    await synchronizePushSubscription("new-user", "en");
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(localStorage.getItem("scooter-notifications-owner:v1")).toBeNull();
  });

  it("does not prompt or register a new destination when permission is not granted", async () => {
    vi.stubGlobal("Notification", { permission: "default", requestPermission });
    localStorage.setItem("scooter-notifications-owner:v1", "user-1");
    await synchronizePushSubscription("user-1", "en");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(requestPermission).not.toHaveBeenCalled();
  });
});
