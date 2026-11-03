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
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationsWorkspace } from "./NotificationsWorkspace";
import { NotificationSettings } from "./NotificationSettings";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  user: {
    id: "mechanic",
    isSuperAdmin: false,
    effectiveScopes: { "notifications.receive": ["ASSIGNED"] },
  },
}));
vi.mock("@/lib/api", () => ({ webApi: { fetch: mocks.fetch } }));
vi.mock("@/components/auth/SessionProvider", () => ({
  useSession: () => ({ user: mocks.user }),
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

beforeEach(() => {
  mocks.fetch.mockReset();
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

describe("notifications workspace", () => {
  it("shows brand-qualified scooters and change summaries, without admin history for a mechanic", async () => {
    show(<NotificationsWorkspace />);
    expect(
      await screen.findByText("Maria updated Brake repair."),
    ).toBeInTheDocument();
    expect(screen.getByText("007 HON")).toBeInTheDocument();
    expect(
      screen.getByText("Changed: checklist, location"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Activity history" }),
    ).not.toBeInTheDocument();
  });

  it("marks all read using the server cutoff and prevents duplicate submissions", async () => {
    let complete: (() => void) | undefined;
    mocks.fetch.mockImplementation((path: string) =>
      path === v1.notifications.ROUTES.readAll
        ? new Promise((resolve) => {
            complete = () => resolve({ ok: true });
          })
        : Promise.resolve(list),
    );
    show(<NotificationsWorkspace />);
    const button = await screen.findByRole("button", {
      name: "Mark all as read",
    });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    fireEvent.click(button);
    expect(
      mocks.fetch.mock.calls.filter(
        ([path]) => path === v1.notifications.ROUTES.readAll,
      ),
    ).toHaveLength(1);
    expect(mocks.fetch).toHaveBeenCalledWith(
      v1.notifications.ROUTES.readAll,
      expect.anything(),
      { method: "POST", json: { cutoff } },
    );
    await act(async () => {
      complete?.();
    });
    expect(
      await screen.findByRole("button", { name: "Marked as read" }),
    ).toBeDisabled();
  });

  it("opens an authorized pushed notification outside the current page and marks only it read", async () => {
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
      await screen.findByText("Maria updated Older repair."),
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
      await screen.findByText("Maria updated Second repair."),
    ).toBeInTheDocument();
    expect(screen.getByText("Maria updated Brake repair.")).toBeInTheDocument();
    expect(
      mocks.fetch.mock.calls.some(([path]) => path.includes("cursor=cursor-1")),
    ).toBe(true);
  });
});

describe("notification preferences", () => {
  it("preserves the selection and action label on failure and blocks Enter resubmission while pending", async () => {
    let fail: (() => void) | undefined;
    mocks.fetch.mockImplementation(
      (path: string, _schema: unknown, options?: { method?: string }) => {
        if (options?.method === "PATCH")
          return new Promise((_resolve, reject) => {
            fail = () => reject(new Error("unavailable"));
          });
        return Promise.resolve(
          path.includes("preferences")
            ? { pushEnabled: true, mutedCategories: [] }
            : { configured: false, publicKey: null },
        );
      },
    );
    show(<NotificationSettings />);
    const toggle = await screen.findByRole("switch", {
      name: "Allow push notifications",
    });
    fireEvent.click(toggle);
    const submit = screen.getByRole("button", {
      name: "Save notification preferences",
    });
    const form = submit.closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(
      mocks.fetch.mock.calls.filter(
        ([, , options]) => options?.method === "PATCH",
      ),
    ).toHaveLength(1);
    expect(submit).toBeDisabled();
    await act(async () => {
      fail?.();
    });
    expect(
      screen.getByRole("button", { name: "Save notification preferences" }),
    ).toBeEnabled();
    expect(toggle).not.toBeChecked();
    expect(
      screen.getByText(
        "Your preferences could not be saved. Your selections have been kept.",
      ),
    ).toBeInTheDocument();
  });
});
