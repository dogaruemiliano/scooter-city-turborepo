import { act, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import { v1 } from "@repo/api-shared";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import {
  ActivityNotificationsProvider,
  useActivityNotifications,
} from "./ActivityNotificationsProvider";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  add: vi.fn(),
  dismiss: vi.fn(),
  router: { push: vi.fn() },
  clearPush: vi.fn(),
  synchronizePush: vi.fn(),
  authenticated: true,
  user: {
    id: "mechanic",
    accessRevision: 1,
    effectiveScopes: { "notifications.receive": ["ASSIGNED"] },
  },
}));
vi.mock("@/lib/api", () => ({ webApi: { fetch: mocks.fetch } }));
vi.mock("@/components/auth/SessionProvider", () => ({
  useOptionalSession: () => ({ user: mocks.authenticated ? mocks.user : null }),
}));
vi.mock("@/components/WorkspaceNotifications", () => ({
  useWorkspaceNotifications: () => ({ add: mocks.add, dismiss: mocks.dismiss }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("./push-client", () => ({
  clearPushForOtherAccount: mocks.clearPush,
  synchronizePushSubscription: mocks.synchronizePush,
  supportsPush: () => false,
}));

const item: v1.notifications.Notification = {
  id: "notice-1",
  eventId: "event-1",
  type: "issue.commented",
  category: "jobs",
  actorName: "Maria",
  actorIsSystem: false,
  subjectType: "issue",
  subjectId: "issue-1",
  subjectLabel: "Brake repair",
  targetPath: "/problems/issue-1",
  scooter: { id: "scooter-1", fleetNumber: 7, brandCode: "HON" },
  changes: [],
  reason: "assigned",
  createdAt: "2026-11-03T10:00:00.000Z",
  readAt: null,
  presentedAt: null,
};
const list = {
  items: [item],
  nextCursor: null,
  unreadCount: 1,
  cutoff: "2026-11-03T10:01:00.000Z",
};
function intl(children: ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={messages.en}>
      {children}
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  mocks.authenticated = true;
  vi.useFakeTimers();
  mocks.fetch.mockReset();
  mocks.add.mockReset();
  mocks.dismiss.mockReset();
  mocks.clearPush.mockReset().mockResolvedValue(undefined);
  mocks.synchronizePush.mockReset().mockResolvedValue(undefined);
  mocks.fetch.mockImplementation((path: string) =>
    Promise.resolve(
      path === v1.notifications.ROUTES.presented ? { ok: true } : list,
    ),
  );
  mocks.add.mockImplementation(({ id }: { id: string }) => id);
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("foreground notification delivery", () => {
  it("keeps the badge cleared when an older poll finishes after the inbox was marked seen", async () => {
    let finishPoll!: (value: typeof list) => void;
    const captured = vi.fn();
    function InboxState() {
      const notifications = useActivityNotifications();
      useEffect(() => {
        captured(notifications);
      }, [notifications]);
      return (
        <output data-testid="unread-count">{notifications?.unreadCount}</output>
      );
    }
    mocks.fetch.mockImplementation((path: string) => {
      if (path.includes("pending=true"))
        return new Promise((resolve) => {
          finishPoll = resolve;
        });
      if (path === v1.notifications.ROUTES.readAll)
        return Promise.resolve({ ok: true });
      return Promise.resolve({
        ...list,
        items: [{ ...item, readAt: list.cutoff }],
        unreadCount: 0,
      });
    });
    render(
      intl(
        <ActivityNotificationsProvider>
          <InboxState />
        </ActivityNotificationsProvider>,
      ),
    );
    await act(async () => {});
    await act(async () =>
      captured.mock.calls.at(-1)![0].markAllRead(list.cutoff),
    );
    expect(screen.getByTestId("unread-count")).toHaveTextContent("0");
    await act(async () => finishPoll({ ...list, unreadCount: 60 }));
    expect(screen.getByTestId("unread-count")).toHaveTextContent("0");
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("announces new head items even when the unread count stays the same", async () => {
    const listener = vi.fn();
    window.addEventListener("notifications-updated", listener);
    try {
      await act(async () => {
        render(
          intl(
            <ActivityNotificationsProvider>
              <span>Workspace</span>
            </ActivityNotificationsProvider>,
          ),
        );
      });
      listener.mockClear();
      mocks.fetch.mockResolvedValue({
        ...list,
        items: [
          {
            ...item,
            id: "notice-2",
            eventId: "event-2",
            createdAt: "2026-11-03T10:02:00.000Z",
          },
        ],
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(listener).toHaveBeenCalled();
    } finally {
      window.removeEventListener("notifications-updated", listener);
    }
  });
  it("does not treat a temporarily missing hydrated identity as a logout", async () => {
    mocks.authenticated = false;
    await act(async () => {
      render(
        intl(
          <ActivityNotificationsProvider>
            <span>Loading account</span>
          </ActivityNotificationsProvider>,
        ),
      );
    });
    expect(mocks.clearPush).not.toHaveBeenCalled();
    expect(mocks.synchronizePush).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("clears the previous browser owner when switching to a Client without notification access", async () => {
    const previousId = mocks.user.id;
    const previousScopes = mocks.user.effectiveScopes["notifications.receive"];
    mocks.user.id = "client";
    mocks.user.effectiveScopes["notifications.receive"] = [];
    try {
      await act(async () => {
        render(
          intl(
            <ActivityNotificationsProvider>
              <span>Client workspace</span>
            </ActivityNotificationsProvider>,
          ),
        );
      });
      expect(mocks.clearPush).toHaveBeenCalledWith("client");
      expect(mocks.synchronizePush).not.toHaveBeenCalled();
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(mocks.add).not.toHaveBeenCalled();
    } finally {
      mocks.user.id = previousId;
      mocks.user.effectiveScopes["notifications.receive"] = previousScopes;
    }
  });

  it("does not acknowledge a fetch; acknowledges only the rendered alert and keeps it unread", async () => {
    await act(async () => {
      render(
        intl(
          <ActivityNotificationsProvider>
            <span>Workspace</span>
          </ActivityNotificationsProvider>,
        ),
      );
    });
    expect(mocks.add).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(
      mocks.fetch.mock.calls.some(
        ([path]) => path === v1.notifications.ROUTES.presented,
      ),
    ).toBe(false);

    const description = mocks.add.mock.calls[0]![0].description as ReactNode;
    await act(async () => {
      render(intl(<div data-slot="toast">{description}</div>));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_100);
    });
    expect(mocks.fetch).toHaveBeenCalledWith(
      v1.notifications.ROUTES.presented,
      expect.anything(),
      expect.objectContaining({ method: "POST", json: { ids: [item.id] } }),
    );
    expect(
      mocks.fetch.mock.calls.some(
        ([path]) => path === v1.notifications.ROUTES.read(item.id),
      ),
    ).toBe(false);
  });

  it("does not poll or acknowledge while the app is hidden", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    await act(async () => {
      render(
        intl(
          <ActivityNotificationsProvider>
            <span>Workspace</span>
          </ActivityNotificationsProvider>,
        ),
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.add).not.toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(mocks.add).toHaveBeenCalledTimes(1);
  });

  it("does not acknowledge alerts hidden by the shared toast limit", async () => {
    await act(async () => {
      render(
        intl(
          <ActivityNotificationsProvider>
            <span>Workspace</span>
          </ActivityNotificationsProvider>,
        ),
      );
    });
    const description = mocks.add.mock.calls[0]![0].description as ReactNode;
    const alert = render(
      intl(
        <div data-slot="toast" data-limited="">
          {description}
        </div>,
      ),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(
      mocks.fetch.mock.calls.some(
        ([path]) => path === v1.notifications.ROUTES.presented,
      ),
    ).toBe(false);
    await act(async () => {
      alert.container
        .querySelector('[data-slot="toast"]')!
        .removeAttribute("data-limited");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_100);
    });
    expect(
      mocks.fetch.mock.calls.some(
        ([path]) => path === v1.notifications.ROUTES.presented,
      ),
    ).toBe(true);
  });

  it("cleans up visible alerts and ignores delayed responses after the session leaves", async () => {
    let release: ((value: typeof list) => void) | undefined;
    mocks.fetch.mockImplementation(
      () =>
        new Promise<typeof list>((resolve) => {
          release = resolve;
        }),
    );
    const screen = render(
      intl(
        <ActivityNotificationsProvider>
          <span>Workspace</span>
        </ActivityNotificationsProvider>,
      ),
    );
    await act(async () => {
      screen.unmount();
      release?.(list);
    });
    expect(mocks.add).not.toHaveBeenCalled();
  });
});
