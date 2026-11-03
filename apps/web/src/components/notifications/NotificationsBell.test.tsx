import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationsBell } from "./NotificationsBell";

const mocks = vi.hoisted(() => ({
  mobile: false,
  refresh: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@repo/ui/hooks/use-mobile", () => ({
  useIsMobile: () => mocks.mobile,
}));
vi.mock("./ActivityNotificationsProvider", () => ({
  useActivityNotifications: () => ({
    unreadCount: 1,
    error: false,
    refresh: mocks.refresh,
    markRead: mocks.read,
    recent: [
      {
        id: "n1",
        eventId: "e1",
        type: "issue.commented",
        category: "jobs",
        actorName: "Maria",
        subjectType: "issue",
        subjectId: "p1",
        subjectLabel: "Brake repair",
        targetPath: "/problems/p1",
        scooter: { id: "s1", fleetNumber: 7, brandCode: "HON" },
        changes: [],
        reason: "assigned",
        createdAt: "2026-11-03T10:00:00.000Z",
        readAt: null,
        presentedAt: null,
      },
    ],
  }),
}));
function show() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <NotificationsBell />
    </NextIntlClientProvider>,
  );
}
beforeEach(() => {
  mocks.mobile = false;
  mocks.refresh.mockReset().mockResolvedValue(undefined);
  mocks.read.mockReset().mockResolvedValue(undefined);
});
describe("notification preview", () => {
  it("opens a desktop popover and keeps settings in account settings", async () => {
    const view = show();
    fireEvent.click(
      screen.getByRole("button", { name: "1 unread notifications" }),
    );
    expect(
      await screen.findByRole("link", {
        name: "Maria commented on Brake repair.",
      }),
    ).toBeVisible();
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("link", { name: "Notification settings" }),
    ).toHaveAttribute("href", "/en/account/settings#notifications");
    expect(
      view.baseElement.querySelector('[data-slot="popover-content"]'),
    ).toBeInTheDocument();
    expect(
      view.baseElement.querySelector('[data-slot="bottom-sheet-popup"]'),
    ).not.toBeInTheDocument();
  });
  it("links directly to the complete inbox on mobile without preview controls", () => {
    mocks.mobile = true;
    const view = show();
    expect(
      screen.getByRole("link", { name: "1 unread notifications" }),
    ).toHaveAttribute("href", "/en/notifications");
    expect(
      view.baseElement.querySelector('[data-slot="bottom-sheet-popup"]'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Notification settings" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "View all notifications" }),
    ).not.toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("opens a desktop preview item without a separate mark-as-read button", async () => {
    let finish!: () => void;
    mocks.read.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    show();
    fireEvent.click(
      screen.getByRole("button", { name: "1 unread notifications" }),
    );
    const link = await screen.findByRole("link", {
      name: "Maria commented on Brake repair.",
    });
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    fireEvent.click(link);
    expect(mocks.read).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: "Mark as read" }),
    ).not.toBeInTheDocument();
    await act(async () => {
      finish();
    });
  });
});
