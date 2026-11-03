import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import userEvent from "@testing-library/user-event";
import { messages } from "@repo/i18n";
import type { v1 } from "@repo/api-shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationTimeline } from "./NotificationTimeline";
import {
  notificationDateKey,
  notificationDateLabel,
  notificationRelativeTime,
} from "./notification-time";

const now = new Date(2026, 10, 3, 12).getTime();
const item: v1.notifications.Notification = {
  id: "n1",
  eventId: "e1",
  type: "issue.commented",
  category: "jobs",
  actorName: "Maria",
  subjectType: "issue",
  subjectId: "issue1",
  subjectLabel: "Brake repair",
  targetPath: "/problems/issue1",
  scooter: { id: "s1", fleetNumber: 7, brandCode: "HON" },
  changes: ["checklist"],
  reason: "assigned",
  createdAt: new Date(now - 120_000).toISOString(),
  readAt: null,
  presentedAt: null,
};
function show(
  items: v1.notifications.Notification[],
  props: Partial<React.ComponentProps<typeof NotificationTimeline>> = {},
  locale: "en" | "ro" = "en",
) {
  vi.spyOn(Date, "now").mockReturnValue(now);
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <NotificationTimeline items={items} {...props} />
    </NextIntlClientProvider>,
  );
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("notification reading", () => {
  it("groups local calendar dates and keeps read state accessible without repeating badges", () => {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const earlier = new Date(now);
    earlier.setDate(earlier.getDate() - 3);
    const result = show([
      item,
      {
        ...item,
        id: "n2",
        createdAt: yesterday.toISOString(),
        readAt: yesterday.toISOString(),
      },
      { ...item, id: "n3", createdAt: earlier.toISOString() },
    ]);
    expect(screen.getByRole("heading", { name: "Today" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Yesterday" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Saturday" })).toBeVisible();
    expect(
      result.container.querySelector('[data-notification-id="n1"]'),
    ).toHaveAttribute("data-unread", "true");
    expect(
      result.container.querySelector('[data-notification-id="n2"]'),
    ).not.toHaveAttribute("data-unread");
    expect(screen.getAllByText("Unread")).toHaveLength(2);
    expect(screen.getAllByText("Unread")[0]).toHaveClass("sr-only");
    expect(screen.getAllByText("007 HON")).toHaveLength(3);
    expect(screen.getByText("2 minutes ago")).toBeVisible();
  });

  it("emphasizes the actor and subject and opens independently of marking as read", async () => {
    const onRead = vi.fn().mockResolvedValue(undefined);
    const onOpen = vi.fn();
    const view = show([item], { onRead, onOpen });
    const link = screen.getByRole("link", {
      name: "Maria commented on Brake repair.",
    });
    expect(within(link).getByText("Maria").tagName).toBe("STRONG");
    expect(within(link).getByText("Brake repair").tagName).toBe("STRONG");
    expect(link).toHaveAttribute("href", "/en/problems/issue1");
    expect(
      screen.queryByRole("button", { name: "Mark as read" }),
    ).not.toBeInTheDocument();
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    expect(onRead).toHaveBeenCalledWith(item.id);
    expect(onOpen).toHaveBeenCalledOnce();
    view.rerender(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <NotificationTimeline
          items={[{ ...item, readAt: new Date(now).toISOString() }]}
          onRead={onRead}
        />
      </NextIntlClientProvider>,
    );
    expect(
      screen.queryByRole("button", { name: "Mark as read" }),
    ).not.toBeInTheDocument();
    expect(view.container.querySelector("article")).not.toHaveAttribute(
      "data-unread",
    );
    expect(view.container.querySelector("article")).toHaveClass(
      "bg-card",
      "text-card-foreground",
    );
  });

  it("exposes the exact timestamp on keyboard focus", async () => {
    show([item]);
    const user = userEvent.setup();
    await user.tab();
    await user.tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(item.createdAt)),
    );
  });

  it("refreshes relative times while the list remains open", async () => {
    vi.useFakeTimers();
    show([item]);
    vi.spyOn(Date, "now").mockReturnValue(now + 60_000);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(screen.getByText("3 minutes ago")).toBeVisible();
  });

  it("updates date dividers after local midnight without refreshing the page", async () => {
    vi.useFakeTimers();
    const beforeMidnight = new Date(2026, 10, 3, 23, 59, 30).getTime();
    const clock = vi.spyOn(Date, "now").mockReturnValue(beforeMidnight);
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <NotificationTimeline
          items={[
            { ...item, createdAt: new Date(beforeMidnight).toISOString() },
          ]}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "Today" })).toBeVisible();
    clock.mockReturnValue(new Date(2026, 10, 4, 0, 0, 30).getTime());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(screen.getByRole("heading", { name: "Yesterday" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Today" }),
    ).not.toBeInTheDocument();
  });
});

describe("notification time formatting", () => {
  it.each([
    [new Date(2026, 10, 3, 9), "Astăzi"],
    [new Date(2026, 10, 2, 9), "Ieri"],
    [new Date(2026, 10, 1, 9), "Duminică"],
    [new Date(2026, 9, 28, 9), "Miercuri"],
    [new Date(2026, 9, 27, 9), "27.10"],
    [new Date(2025, 10, 3, 9), "03.11.2025"],
  ])("formats the divider for %s as %s", (date, label) => {
    expect(
      notificationDateLabel(date.toISOString(), now, "ro", {
        today: "Astăzi",
        yesterday: "Ieri",
      }),
    ).toBe(label);
  });

  it("groups exact days across appended pages and orders the newest day first", () => {
    const sunday = new Date(2026, 10, 1, 12).toISOString();
    const older = new Date(2026, 9, 20, 12).toISOString();
    const view = show(
      [
        { ...item, id: "old", createdAt: older },
        { ...item, id: "sun-1", createdAt: sunday },
      ],
      {},
      "ro",
    );
    expect(
      screen.getAllByRole("heading").map((heading) => heading.textContent),
    ).toEqual(["Duminică", "20.10"]);
    view.rerender(
      <NextIntlClientProvider locale="ro" messages={messages.ro}>
        <NotificationTimeline
          items={[
            { ...item, id: "old", createdAt: older },
            { ...item, id: "sun-1", createdAt: sunday },
            { ...item, id: "sun-2", createdAt: sunday },
          ]}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getAllByRole("heading", { name: "Duminică" })).toHaveLength(
      1,
    );
    expect(
      within(screen.getByRole("region", { name: "Duminică" })).getAllByRole(
        "article",
      ),
    ).toHaveLength(2);
    expect(
      screen.queryByRole("heading", { name: "Mai devreme" }),
    ).not.toBeInTheDocument();
  });

  it("uses local midnight rather than elapsed 24-hour buckets", () => {
    const midnight = new Date(2026, 10, 3, 0, 1).getTime();
    expect(
      notificationDateLabel(
        new Date(2026, 10, 2, 23, 59).toISOString(),
        midnight,
        "en",
        { today: "Today", yesterday: "Yesterday" },
      ),
    ).toBe("Yesterday");
    expect(
      notificationDateKey(new Date(2026, 10, 2, 23, 59).toISOString()),
    ).toBe("2026-11-02");
    expect(
      notificationRelativeTime(
        new Date(midnight + 1000).toISOString(),
        midnight,
        "en",
        "Just now",
      ),
    ).toBe("Just now");
    expect(
      notificationRelativeTime(
        new Date(midnight - 120_000).toISOString(),
        midnight,
        "ro",
        "Chiar acum",
      ),
    ).toBe("acum 2 minute");
  });
});
