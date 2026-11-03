import { v1 } from "@repo/api-shared";
import type { SupportedLocale } from "@repo/i18n";
import { webApi } from "@/lib/api";

export const NOTIFICATIONS_WORKER_PATH = "/notifications-sw.js";
const PUSH_OWNER_KEY = "scooter-notifications-owner:v1";

function setPushOwner(userId: string | null) {
  try {
    if (userId) localStorage.setItem(PUSH_OWNER_KEY, userId);
    else localStorage.removeItem(PUSH_OWNER_KEY);
  } catch {
    /* Browser storage can be disabled independently of push. */
  }
}

export async function clearPushForOtherAccount(userId: string): Promise<void> {
  let owner: string | null = null;
  try {
    owner = localStorage.getItem(PUSH_OWNER_KEY);
  } catch {
    return;
  }
  if (owner && owner !== userId) await unsubscribeBrowserPush();
}

/** Rebind an already-consented destination after a new login/session. */
export async function synchronizePushSubscription(
  userId: string,
  locale: SupportedLocale,
): Promise<void> {
  if (!supportsPush() || Notification.permission !== "granted") return;
  let owner: string | null = null;
  try {
    owner = localStorage.getItem(PUSH_OWNER_KEY);
  } catch {
    return;
  }
  if (owner !== userId) {
    if (owner) await unsubscribeBrowserPush();
    return;
  }
  const subscription = await currentPushSubscription();
  if (!subscription) return;
  const config = await webApi.fetch(
    v1.notifications.ROUTES.pushConfig,
    v1.notifications.pushConfigSchema,
    { cache: "no-store" },
  );
  if (!config.configured) return;
  const json = subscription.toJSON();
  await webApi.fetch(
    v1.notifications.ROUTES.pushSubscriptions,
    v1.notifications.notificationMutationResultSchema,
    {
      method: "POST",
      json: v1.notifications.registerPushSubscriptionInputSchema.parse({
        endpoint: subscription.endpoint,
        keys: json.keys,
        locale,
      }),
    },
  );
}

export function supportsPush(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function isIosWithoutInstallation(): boolean {
  if (typeof window === "undefined") return false;
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return (
    ios &&
    !window.matchMedia("(display-mode: standalone)").matches &&
    !(navigator as Navigator & { standalone?: boolean }).standalone
  );
}

export function applicationServerKey(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = window.atob(
    base64 + "=".repeat((4 - (base64.length % 4)) % 4),
  );
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer;
}

export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (!supportsPush()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration?.active?.scriptURL.endsWith(NOTIFICATIONS_WORKER_PATH))
    return null;
  return registration.pushManager.getSubscription();
}

export async function registerPush(
  publicKey: string,
  locale: SupportedLocale,
  userId: string,
  signal?: AbortSignal,
): Promise<void> {
  // This function is called only from the explicit enable action. Permission
  // is requested before asynchronous registration to retain the user gesture.
  signal?.throwIfAborted();
  const permission = await Notification.requestPermission();
  signal?.throwIfAborted();
  if (permission !== "granted")
    throw new Error("Push permission was not granted");
  const registration = await navigator.serviceWorker.register(
    NOTIFICATIONS_WORKER_PATH,
    { scope: "/", updateViaCache: "none" },
  );
  await navigator.serviceWorker.ready;
  signal?.throwIfAborted();
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(publicKey),
    }));
  const json = subscription.toJSON();
  const input = v1.notifications.registerPushSubscriptionInputSchema.parse({
    endpoint: subscription.endpoint,
    keys: json.keys,
    locale,
  });
  try {
    signal?.throwIfAborted();
    await webApi.fetch(
      v1.notifications.ROUTES.pushSubscriptions,
      v1.notifications.notificationMutationResultSchema,
      { method: "POST", json: input, ...(signal ? { signal } : {}) },
    );
    signal?.throwIfAborted();
    setPushOwner(userId);
  } catch (error) {
    // An unbound destination must not appear enabled on a shared device.
    await subscription.unsubscribe();
    throw error;
  }
}

export async function unregisterPush(): Promise<void> {
  const subscription = await currentPushSubscription();
  if (!subscription) return;
  try {
    await webApi.fetch(
      v1.notifications.ROUTES.pushSubscriptions,
      v1.notifications.notificationMutationResultSchema,
      { method: "DELETE", json: { endpoint: subscription.endpoint } },
    );
  } finally {
    await subscription.unsubscribe();
    setPushOwner(null);
  }
}

/** Drop the browser destination before credentials disappear or accounts switch. */
export async function unsubscribeBrowserPush(): Promise<void> {
  const subscription = await currentPushSubscription();
  await subscription?.unsubscribe();
  if (supportsPush()) {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const notifications = await registration?.getNotifications?.();
    for (const notification of notifications ?? []) notification.close();
  }
  setPushOwner(null);
}
