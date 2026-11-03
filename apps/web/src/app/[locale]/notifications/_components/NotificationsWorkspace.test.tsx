import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import { v1 } from "@repo/api-shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationsWorkspace } from "./NotificationsWorkspace";
import { PageRefreshSurface } from "@/components/PageRefresh";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  markAllRead: vi.fn(),
  markRead: vi.fn(),
  user: {
    id: "mechanic",
    accessRevision: 0,
    isSuperAdmin: false,
    effectiveScopes: { "notifications.receive": ["ASSIGNED"] },
  },
}));
vi.mock("@/lib/api", () => ({ webApi: { fetch: mocks.fetch } }));
vi.mock("@/components/auth/SessionProvider", () => ({
  useSession: () => ({ user: mocks.user }),
}));
vi.mock("@/components/notifications/ActivityNotificationsProvider", () => ({
  useActivityNotifications: () => ({
    markAllRead: mocks.markAllRead,
    markRead: mocks.markRead,
  }),
}));
const first: v1.notifications.Notification = {
  id: "n1",
  eventId: "e1",
  type: "issue.updated",
  category: "jobs",
  actorName: "Maria",
  actorIsSystem: false,
  subjectType: "issue",
  subjectId: "issue-1",
  subjectLabel: "Brake repair",
  targetPath: "/problems/issue-1",
  scooter: { id: "s1", fleetNumber: 7, brandCode: "HON" },
  changes: ["checklist", "location"],
  reason: "assigned",
  createdAt: "2026-11-03T10:00:00.000Z",
  readAt: null,
  presentedAt: null,
};
const cutoff = "2026-11-03T10:01:00.000Z";
const list: v1.notifications.NotificationList = {
  items: [first],
  nextCursor: null,
  unreadCount: 1,
  cutoff,
};
function show(element: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      {element}
    </NextIntlClientProvider>,
  );
}

function showMobile(element: React.ReactNode) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
  return show(
    <div>
      <PageRefreshSurface>{element}</PageRefreshSurface>
    </div>,
  );
}

beforeEach(() => {
  mocks.user.id = "mechanic";
  mocks.user.accessRevision = 0;
  mocks.user.isSuperAdmin = false;
  window.history.replaceState({}, "", "/en/notifications");
  mocks.fetch.mockReset();
  mocks.markAllRead.mockReset().mockResolvedValue(undefined);
  mocks.markRead.mockReset().mockResolvedValue(undefined);
  mocks.fetch.mockImplementation((path: string) =>
    Promise.resolve(
      path.includes("preferences")
        ? { pushEnabled: true, mutedCategories: [] }
        : path.includes("push-config")
          ? { configured: false, publicKey: null }
          : list,
    ),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("notifications workspace", () => {
  it("ignores an older background sync after an explicit refresh starts", async () => {
    showMobile(<NotificationsWorkspace />);
    await screen.findByRole("link", { name: "Maria updated Brake repair." });
    const refresh = await screen.findByRole("button", {
      name: messages.en.shared.pullToRefresh.refresh,
    });
    await waitFor(() => expect(refresh).toBeEnabled());
    expect(
      screen.queryByRole("button", { name: "Refresh" }),
    ).not.toBeInTheDocument();
    let finishSync!: (value: v1.notifications.NotificationList) => void;
    mocks.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSync = resolve;
        }),
    );
    act(() => window.dispatchEvent(new CustomEvent("notifications-updated")));
    mocks.fetch.mockResolvedValueOnce({
      ...list,
      items: [{ ...first, subjectLabel: "Fresh task" }],
    });
    fireEvent.click(refresh);
    await screen.findByRole("link", { name: "Maria updated Fresh task." });
    await act(async () => finishSync(list));
    expect(
      screen.getByRole("link", { name: "Maria updated Fresh task." }),
    ).toBeVisible();
  });

  it("refreshes the mobile feed and recovers after failure", async () => {
    const previousMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    try {
      show(
        <div>
          <PageRefreshSurface>
            <NotificationsWorkspace />
          </PageRefreshSurface>
        </div>,
      );
      await screen.findByRole("link", { name: "Maria updated Brake repair." });
      const refresh = await screen.findByRole("button", {
        name: messages.en.shared.pullToRefresh.refresh,
      });
      await waitFor(() => expect(refresh).toBeEnabled());
      mocks.fetch.mockRejectedValueOnce(new Error("Offline"));
      fireEvent.click(refresh);
      await waitFor(() => expect(refresh).toBeEnabled());
      expect(screen.getByRole("alert")).toBeVisible();
      expect(
        screen.getByRole("link", { name: "Maria updated Brake repair." }),
      ).toBeVisible();
      mocks.fetch.mockClear();
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      await waitFor(() => expect(refresh).toBeEnabled());
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(mocks.fetch).toHaveBeenCalledWith(
        expect.stringContaining("limit=30"),
        expect.anything(),
        { cache: "no-store" },
      );
    } finally {
      window.matchMedia = previousMatchMedia;
    }
  });

  it("shows a single notification feed without tabs, pills or a category selector", async () => {
    mocks.user.isSuperAdmin = true;
    show(<NotificationsWorkspace />);
    await screen.findByRole("link", { name: "Maria updated Brake repair." });
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(
      mocks.fetch.mock.calls.every(
        ([path]) =>
          !path.includes("category=") &&
          !path.includes("unreadOnly=") &&
          path !== v1.notifications.ROUTES.activity,
      ),
    ).toBe(true);
  });

  it("queues arrivals while the reader is in older history, then applies them explicitly", async () => {
    show(<NotificationsWorkspace />);
    await screen.findByRole("link", { name: "Maria updated Brake repair." });
    await waitFor(() => expect(mocks.markAllRead).toHaveBeenCalledOnce());
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      top: -100,
    } as DOMRect);
    const next = {
      ...list,
      items: [
        {
          ...first,
          id: "n2",
          eventId: "e2",
          subjectLabel: "New repair",
          createdAt: "2026-11-03T10:02:00.000Z",
        },
        first,
      ],
      unreadCount: 2,
      cutoff: "2026-11-03T10:03:00.000Z",
    };
    mocks.fetch.mockResolvedValue(next);
    await act(async () => {
      window.dispatchEvent(new CustomEvent("notifications-updated"));
    });
    expect(
      await screen.findByRole("button", { name: "Show new notifications" }),
    ).toHaveTextContent("1 new notification");
    expect(
      screen.queryByRole("link", { name: "Maria updated New repair." }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Show new notifications" }),
    );
    expect(
      await screen.findByRole("link", { name: "Maria updated New repair." }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Show new notifications" }),
    ).not.toBeInTheDocument();
  });

  it("reveals arrivals immediately while the reader is at the top", async () => {
    const view = show(<NotificationsWorkspace />);
    await screen.findByRole("link", { name: "Maria updated Brake repair." });
    await waitFor(() => expect(mocks.markAllRead).toHaveBeenCalledOnce());
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      top: 100,
    } as DOMRect);
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    mocks.fetch.mockResolvedValue({
      ...list,
      items: [
        {
          ...first,
          id: "n2",
          eventId: "e2",
          subjectLabel: "New repair",
          createdAt: "2026-11-03T10:02:00.000Z",
        },
        first,
      ],
      unreadCount: 2,
    });
    await act(async () => {
      window.dispatchEvent(new CustomEvent("notifications-updated"));
    });
    expect(
      await screen.findByRole("link", { name: "Maria updated New repair." }),
    ).toBeVisible();
    expect(
      view.container.querySelector('[data-notification-id="n2"]'),
    ).toHaveAttribute("data-entering", "true");
    expect(
      view.container.querySelector('[data-notification-id="n2"]'),
    ).toHaveAttribute("data-unread", "true");
    expect(mocks.markAllRead).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: "Show new notifications" }),
    ).not.toBeInTheDocument();
  });

  it("retains unread state on acknowledgement failure and offers recovery", async () => {
    mocks.markAllRead.mockRejectedValueOnce(new Error("offline"));
    const view = show(<NotificationsWorkspace />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "could not be marked as seen",
    );
    expect(
      view.container.querySelector('[data-notification-id="n1"]'),
    ).toHaveAttribute("data-unread", "true");
    fireEvent.click(
      screen.getByRole("button", { name: "Mark notifications as seen" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );
    expect(mocks.markAllRead).toHaveBeenLastCalledWith(cutoff);
    expect(
      view.container.querySelector('[data-notification-id="n1"]'),
    ).not.toHaveAttribute("data-unread");
  });
  it("shows brand-qualified scooters and change summaries, without admin history for a mechanic", async () => {
    show(<NotificationsWorkspace />);
    expect(
      await screen.findByRole("link", { name: "Maria updated Brake repair." }),
    ).toBeInTheDocument();
    expect(screen.getByText("007 HON")).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Notification settings" }),
    ).not.toBeInTheDocument();
    expect(
      mocks.fetch.mock.calls.some(
        ([path]) => path === v1.notifications.ROUTES.preferences,
      ),
    ).toBe(false);
    expect(
      screen.getByText("Changed: checklist, location"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Activity history" }),
    ).not.toBeInTheDocument();
  });

  it("automatically marks the whole inbox seen once using the server cutoff", async () => {
    let complete: (() => void) | undefined;
    mocks.markAllRead.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    const view = showMobile(<NotificationsWorkspace />);
    await waitFor(() => expect(mocks.markAllRead).toHaveBeenCalledWith(cutoff));
    expect(mocks.markAllRead).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: "Mark all as read" }),
    ).not.toBeInTheDocument();
    expect(
      view.container.querySelector('[data-notification-id="n1"]'),
    ).toHaveAttribute("data-unread");
    await act(async () => {
      complete?.();
    });
    await waitFor(() =>
      expect(
        view.container.querySelector('[data-notification-id="n1"]'),
      ).not.toHaveAttribute("data-unread"),
    );
    const refresh = screen.getByRole("button", {
      name: messages.en.shared.pullToRefresh.refresh,
    });
    await waitFor(() => expect(refresh).toBeEnabled());
    fireEvent.click(refresh);
    await waitFor(() => expect(mocks.markAllRead).toHaveBeenCalledOnce());
    expect(mocks.markAllRead).toHaveBeenCalledOnce();
  });

  it("includes an authorized pushed notification outside the first page", async () => {
    const selected = {
      ...first,
      id: "older",
      eventId: "older-event",
      subjectLabel: "Older repair",
    };
    mocks.fetch.mockImplementation((path: string) =>
      Promise.resolve(
        path === v1.notifications.ROUTES.detail("older")
          ? selected
          : path === v1.notifications.ROUTES.read("older")
            ? { ok: true }
            : list,
      ),
    );
    show(<NotificationsWorkspace openId="older" />);
    expect(
      await screen.findByRole("link", { name: "Maria updated Older repair." }),
    ).toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledWith(
      v1.notifications.ROUTES.read("older"),
      expect.anything(),
      { method: "PATCH", json: {} },
    );
    expect(
      mocks.fetch.mock.calls.some(
        ([path]) => path === v1.notifications.ROUTES.read("n1"),
      ),
    ).toBe(false);
    expect(mocks.markAllRead).toHaveBeenCalledWith(cutoff);
  });

  it("loads the next cursor page and keeps both notifications", async () => {
    mocks.fetch.mockImplementation((path: string) =>
      Promise.resolve(
        path.includes("cursor=")
          ? {
              ...list,
              items: [{ ...first, id: "n2", subjectLabel: "Second repair" }],
              nextCursor: null,
            }
          : { ...list, nextCursor: "cursor-1" },
      ),
    );
    show(<NotificationsWorkspace />);
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    expect(
      await screen.findByRole("link", { name: "Maria updated Second repair." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Maria updated Brake repair." }),
    ).toBeInTheDocument();
    expect(
      mocks.fetch.mock.calls.some(([path]) => path.includes("cursor=cursor-1")),
    ).toBe(true);
  });

  it("automatically loads older notifications once per cursor and deduplicates overlapping pages", async () => {
    let observe!: IntersectionObserverCallback;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          observe = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    let finish!: (value: v1.notifications.NotificationList) => void;
    mocks.fetch.mockImplementation((path: string) =>
      path.includes("cursor=")
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : Promise.resolve({ ...list, nextCursor: "older" }),
    );
    const view = show(<NotificationsWorkspace />);
    await screen.findByRole("button", { name: "Load more" });
    const intersect = () =>
      observe(
        [{ isIntersecting: true }] as IntersectionObserverEntry[],
        {} as IntersectionObserver,
      );
    act(() => {
      intersect();
      intersect();
    });
    expect(
      mocks.fetch.mock.calls.filter(([path]) => path.includes("cursor=older")),
    ).toHaveLength(1);
    await act(async () =>
      finish({
        ...list,
        items: [first, { ...first, id: "n2", subjectLabel: "Older task" }],
        nextCursor: null,
      }),
    );
    await screen.findByRole("link", { name: "Maria updated Older task." });
    expect(
      view.container.querySelectorAll("[data-notification-id]"),
    ).toHaveLength(2);
    expect(
      view.container.querySelector('[data-notification-id="n2"]'),
    ).not.toHaveAttribute("data-unread");
    expect(
      screen.queryByRole("button", { name: "Load more" }),
    ).not.toBeInTheDocument();
  });

  it("retains loaded history on pagination failure and offers a retry", async () => {
    let attempts = 0;
    mocks.fetch.mockImplementation(async (path: string) => {
      if (!path.includes("cursor=")) return { ...list, nextCursor: "older" };
      if (++attempts === 1) throw new Error("Offline");
      return {
        ...list,
        items: [{ ...first, id: "n2", subjectLabel: "Older task" }],
        nextCursor: null,
      };
    });
    show(<NotificationsWorkspace />);
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    await screen.findByText(messages.en.notifications.loadMoreError);
    expect(
      screen.getByRole("link", { name: "Maria updated Brake repair." }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByRole("link", { name: "Maria updated Older task." });
    expect(attempts).toBe(2);
  });

  it("restores loaded cursor pages and mobile scroll position when returning from details", async () => {
    mocks.fetch.mockImplementation(async (path: string) =>
      path.includes("cursor=")
        ? {
            ...list,
            items: [{ ...first, id: "n2", subjectLabel: "Older task" }],
            nextCursor: null,
          }
        : { ...list, nextCursor: "older" },
    );
    const screenView = () => (
      <div data-slot="app-page-scroll" style={{ overflowY: "auto" }}>
        <NotificationsWorkspace />
      </div>
    );
    window.history.replaceState({ routerMarker: true }, "");
    const initial = show(screenView());
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    const link = await screen.findByRole("link", {
      name: "Maria updated Older task.",
    });
    const scrollport = initial.container.querySelector<HTMLElement>(
      '[data-slot="app-page-scroll"]',
    )!;
    scrollport.scrollTop = 900;
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    const entry = window.history.state;
    expect(entry.routerMarker).toBe(true);
    expect(entry["notificationsReturn:v2"].list.items).toHaveLength(2);
    window.history.pushState({}, "", "/en/problems/issue-1");
    initial.unmount();
    window.history.replaceState(entry, "", "/en/notifications");
    mocks.fetch.mockClear();
    const returned = show(screenView());
    await screen.findByRole("link", { name: "Maria updated Older task." });
    await waitFor(() =>
      expect(
        returned.container.querySelector<HTMLElement>(
          '[data-slot="app-page-scroll"]',
        )!.scrollTop,
      ).toBe(900),
    );
    expect(
      mocks.fetch.mock.calls.some(([path]) => path.includes("cursor=")),
    ).toBe(false);
  });

  it("ignores history cached for the removed activity tab or filters", async () => {
    window.history.replaceState(
      {
        notificationsReturn: {
          userId: "mechanic",
          accessRevision: 0,
          href: window.location.href,
          top: 900,
          selection: { tab: "activity", category: "jobs", unreadOnly: true },
          list: {
            ...list,
            items: [{ ...first, subjectLabel: "Old filtered task" }],
          },
        },
      },
      "",
    );
    show(<NotificationsWorkspace />);
    await screen.findByRole("link", { name: "Maria updated Brake repair." });
    expect(
      screen.queryByRole("link", { name: "Maria updated Old filtered task." }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ["another-user", 0],
    ["mechanic", 1],
  ] as const)(
    "does not restore history owned by another account or access revision (%s, %s)",
    async (userId, accessRevision) => {
      window.history.replaceState(
        {
          "notificationsReturn:v2": {
            userId: "mechanic",
            accessRevision: 0,
            href: window.location.href,
            top: 900,
            list: {
              ...list,
              items: [{ ...first, subjectLabel: "Cached private task" }],
            },
          },
        },
        "",
      );
      mocks.user.id = userId;
      mocks.user.accessRevision = accessRevision;
      show(<NotificationsWorkspace />);
      await screen.findByRole("link", { name: "Maria updated Brake repair." });
      expect(
        screen.queryByRole("link", {
          name: "Maria updated Cached private task.",
        }),
      ).not.toBeInTheDocument();
    },
  );
});
