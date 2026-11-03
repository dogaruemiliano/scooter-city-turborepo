import { beforeEach, describe, expect, it, vi } from "vitest";
import Page from "../page";

const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`Redirect: ${path}`);
  }),
}));
vi.mock("@/lib/access-server", () => ({ requireAccess: mocks.requireAccess }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../_components/NotificationsWorkspace", () => ({
  NotificationsWorkspace: () => null,
}));

beforeEach(() => vi.clearAllMocks());

describe("notifications page", () => {
  it("opens the single feed for old activity links and preserves pushed notification IDs", async () => {
    const result = await Page({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({ tab: "activity", open: "notice-1" }),
    });
    expect(result.props).toEqual({ openId: "notice-1" });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each([
    ["en", "/en/account/settings#notifications"],
    ["ro", "/account/settings#notifications"],
  ])("redirects the old settings tab for %s", async (locale, destination) => {
    await expect(
      Page({
        params: Promise.resolve({ locale }),
        searchParams: Promise.resolve({ tab: "settings" }),
      }),
    ).rejects.toThrow(`Redirect: ${destination}`);
    expect(mocks.requireAccess).toHaveBeenCalledWith(
      locale,
      "/notifications",
      "notifications.receive",
    );
    expect(mocks.redirect).toHaveBeenCalledWith(destination);
  });
});
