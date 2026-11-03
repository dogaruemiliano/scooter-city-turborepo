/* Browser push is always visible. Foreground suppression happens on the API
   before dispatch, after an authenticated presentation receipt. */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    // A malformed message still needs a visible fallback for Web Push.
  }
  const title =
    typeof payload.title === "string" ? payload.title : "ScooterCity";
  const body = typeof payload.body === "string" ? payload.body : "ScooterCity";
  const id =
    typeof payload.notificationId === "string"
      ? payload.notificationId
      : undefined;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: id,
      data: { url: safeNotificationUrl(payload.url), notificationId: id },
    }),
  );
});

function safeNotificationUrl(value) {
  try {
    if (
      typeof value !== "string" ||
      value.startsWith("//") ||
      value.includes("\\")
    ) {
      return new URL("/notifications", self.location.origin).href;
    }
    // Push stores the normalized absolute URL in Notification.data. Clicks
    // validate that same URL again, preserving its locale and notification ID.
    const url = value.startsWith("/")
      ? new URL(value, self.location.origin)
      : new URL(value);
    return url.origin === self.location.origin && !url.username && !url.password
      ? url.href
      : new URL("/notifications", self.location.origin).href;
  } catch {
    return new URL("/notifications", self.location.origin).href;
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safeNotificationUrl(event.notification.data?.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const client = windows.find(
        (candidate) => new URL(candidate.url).origin === self.location.origin,
      );
      if (client) {
        await client.navigate(url);
        await client.focus();
      } else {
        await self.clients.openWindow(url);
      }
    })(),
  );
});
