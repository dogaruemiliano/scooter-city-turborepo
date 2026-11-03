import { StrictMode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { v1 } from "@repo/api-shared";
import {
  notificationsAfterVisit,
  useNotificationsVisit,
} from "./useNotificationsVisit";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ webApi: { fetch: mocks.fetch } }));
vi.mock("@/components/notifications/ActivityNotificationsProvider", () => ({
  useActivityNotifications: () => null,
}));
const cutoff = "2026-11-03T10:01:00.000Z";
const snapshot = { items: [], nextCursor: "older", unreadCount: 100, cutoff };
beforeEach(() => {
  mocks.fetch
    .mockReset()
    .mockImplementation(async (path: string) =>
      path === v1.notifications.ROUTES.readAll ? { ok: true } : snapshot,
    );
});

it("acknowledges all history once per visit with the server cutoff, including Strict Mode", async () => {
  const { result, rerender } = renderHook(useNotificationsVisit, {
    wrapper: StrictMode,
  });
  await waitFor(() => expect(result.current.seenCutoff).toBe(cutoff));
  rerender();
  expect(mocks.fetch).toHaveBeenCalledWith(
    v1.notifications.ROUTES.readAll,
    expect.anything(),
    { method: "POST", json: { cutoff } },
  );
  expect(
    mocks.fetch.mock.calls.filter(
      ([path]) => path === v1.notifications.ROUTES.readAll,
    ),
  ).toHaveLength(1);
  expect(result.current.error).toBe(false);
});

it("preserves unread state on failure and retries the original cutoff without consuming later arrivals", async () => {
  let attempts = 0;
  mocks.fetch.mockImplementation(async (path: string) => {
    if (path !== v1.notifications.ROUTES.readAll) return snapshot;
    if (++attempts === 1) throw new Error("Offline");
    return { ok: true };
  });
  const { result } = renderHook(useNotificationsVisit);
  await waitFor(() => expect(result.current.error).toBe(true));
  expect(result.current.seenCutoff).toBeNull();
  await act(async () => result.current.retry());
  expect(result.current.seenCutoff).toBe(cutoff);
  expect(
    mocks.fetch.mock.calls.filter(([path]) => path.includes("limit=1")),
  ).toHaveLength(1);
  expect(mocks.fetch).toHaveBeenLastCalledWith(
    v1.notifications.ROUTES.readAll,
    expect.anything(),
    { method: "POST", json: { cutoff } },
  );
});

it("does not acknowledge a screen that left before its server snapshot loaded", async () => {
  let finish!: (value: typeof snapshot) => void;
  mocks.fetch.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = renderHook(useNotificationsVisit);
  view.unmount();
  await act(async () => finish(snapshot));
  expect(
    mocks.fetch.mock.calls.some(
      ([path]) => path === v1.notifications.ROUTES.readAll,
    ),
  ).toBe(false);
});

it("keeps notifications arriving after the confirmed visit cutoff unread", () => {
  const older = {
    id: "old",
    createdAt: "2026-11-03T10:00:00.000Z",
    readAt: null,
  };
  const later = {
    id: "new",
    createdAt: "2026-11-03T10:02:00.000Z",
    readAt: null,
  };
  const list = {
    ...snapshot,
    cutoff: "2026-11-03T10:03:00.000Z",
    unreadCount: 1,
    items: [later, older],
  } as v1.notifications.NotificationList;
  const result = notificationsAfterVisit(list, cutoff);
  expect(result.items.map((item) => [item.id, item.readAt])).toEqual([
    ["new", null],
    ["old", cutoff],
  ]);
});
