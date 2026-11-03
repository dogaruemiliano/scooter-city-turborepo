import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

function worker() {
  const listeners = new Map<string, (event: unknown) => void>();
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const self = {
    location: { origin: "https://scooter-city.ro" },
    registration: { showNotification },
    clients: { matchAll: vi.fn().mockResolvedValue([]), openWindow },
    addEventListener: (name: string, listener: (event: unknown) => void) =>
      listeners.set(name, listener),
  };
  runInNewContext(
    readFileSync(resolve(process.cwd(), "public/notifications-sw.js"), "utf8"),
    { self, URL },
  );
  return { listeners, showNotification, openWindow };
}

describe("notification service worker", () => {
  it("always displays a visible push and preserves its stable notification ID", async () => {
    const { listeners, showNotification } = worker();
    let completed: Promise<unknown> | undefined;
    listeners.get("push")!({
      data: {
        json: () => ({
          notificationId: "n1",
          title: "ScooterCity",
          body: "Maria updated 007 HON",
          url: "/ro/notifications?open=n1",
        }),
      },
      waitUntil: (promise: Promise<unknown>) => {
        completed = promise;
      },
    });
    await completed;
    expect(showNotification).toHaveBeenCalledWith(
      "ScooterCity",
      expect.objectContaining({
        body: "Maria updated 007 HON",
        tag: "n1",
        data: {
          notificationId: "n1",
          url: "https://scooter-city.ro/ro/notifications?open=n1",
        },
      }),
    );
  });

  it("displays fallback content for malformed push instead of silently dropping it", async () => {
    const { listeners, showNotification } = worker();
    let completed: Promise<unknown> | undefined;
    listeners.get("push")!({
      data: {
        json: () => {
          throw new Error("malformed");
        },
      },
      waitUntil: (promise: Promise<unknown>) => {
        completed = promise;
      },
    });
    await completed;
    expect(showNotification).toHaveBeenCalledWith(
      "ScooterCity",
      expect.objectContaining({ body: "ScooterCity" }),
    );
  });

  it("preserves locale and notification ID through push display and subsequent click", async () => {
    const { listeners, showNotification, openWindow } = worker();
    let completed: Promise<unknown> | undefined;
    const waitUntil = (promise: Promise<unknown>) => {
      completed = promise;
    };
    listeners.get("push")!({
      data: {
        json: () => ({
          notificationId: "n1",
          title: "ScooterCity",
          body: "Updated",
          url: "/ro/notifications?open=n1",
        }),
      },
      waitUntil,
    });
    await completed;
    const displayedData = showNotification.mock.calls[0]![1].data;
    listeners.get("notificationclick")!({
      notification: { data: displayedData, close: vi.fn() },
      waitUntil,
    });
    await completed;
    expect(openWindow).toHaveBeenCalledWith(
      "https://scooter-city.ro/ro/notifications?open=n1",
    );
  });

  it.each([
    "https://evil.test",
    "//evil.test",
    "//scooter-city.ro/ro/notifications?open=n1",
    "/\\evil.test",
    "https://scooter-city.ro\\@evil.test/notifications",
    "https://user:password@scooter-city.ro/notifications",
    "notifications?open=n1",
  ])("rejects external push navigation %s", async (url) => {
    const { listeners, openWindow } = worker();
    let completed: Promise<unknown> | undefined;
    listeners.get("notificationclick")!({
      notification: { data: { url }, close: vi.fn() },
      waitUntil: (promise: Promise<unknown>) => {
        completed = promise;
      },
    });
    await completed;
    expect(openWindow).toHaveBeenCalledWith(
      "https://scooter-city.ro/notifications",
    );
  });
});
