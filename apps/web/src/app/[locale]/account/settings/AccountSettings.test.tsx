import { v1 } from "@repo/api-shared";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SessionProvider } from "../../../../components/auth/SessionProvider";
import { AccountSettings } from "./AccountSettings";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("../../../../lib/api", () => ({
  webApi: {
    fetch: mocks.apiFetch,
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/account/settings",
  useRouter: () => ({
    refresh: mocks.refresh,
    replace: mocks.replace,
  }),
}));

const user: v1.auth.SessionUser = {
  id: "user-1",
  email: "ada@example.com",
  emailVerified: "2026-06-10T10:00:00.000Z",
  phone: null,
  phoneVerified: null,
  firstName: "Ada",
  lastName: "Lovelace",
  roles: ["USER"],
  linkedProviders: ["google"],
  createdAt: "2026-06-01T10:00:00.000Z",
};

const sessions: v1.auth.SessionSummary[] = [
  {
    id: "session-current",
    userAgent: "Mozilla/5.0 (Macintosh) Safari/605.1.15",
    ip: "127.0.0.1",
    createdAt: "2026-06-10T10:00:00.000Z",
    lastUsedAt: "2026-06-15T10:00:00.000Z",
    current: true,
  },
  {
    id: "session-other",
    userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/137.0.0.0",
    ip: "192.0.2.10",
    createdAt: "2026-06-11T10:00:00.000Z",
    lastUsedAt: "2026-06-14T10:00:00.000Z",
    current: false,
  },
];

beforeEach(() => {
  mocks.apiFetch.mockReset();
  mocks.refresh.mockReset();
  mocks.replace.mockReset();

  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: MouseEvent,
  });
});

describe("AccountSettings", () => {
  it("updates the editable profile", async () => {
    const updated = { ...user, firstName: "Grace", lastName: null };
    mocks.apiFetch.mockResolvedValue(updated);
    const browser = userEvent.setup();

    renderSettings();
    await browser.clear(screen.getByLabelText("First name"));
    await browser.type(screen.getByLabelText("First name"), " Grace ");
    await browser.clear(screen.getByLabelText("Last name"));
    await browser.click(screen.getByRole("button", { name: "Save profile" }));

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      v1.auth.ROUTES.updateProfile,
      v1.auth.sessionUserSchema,
      {
        method: "PATCH",
        json: { firstName: "Grace", lastName: null },
      },
    );
    expect(await screen.findByText("Profile saved")).toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("revokes another active session", async () => {
    mocks.apiFetch.mockResolvedValue(undefined);
    const browser = userEvent.setup();

    renderSettings();
    await browser.click(screen.getByRole("button", { name: "Revoke" }));
    const dialog = await screen.findByRole("dialog");
    await browser.click(
      within(dialog).getByRole("button", { name: "Revoke session" }),
    );

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      v1.auth.ROUTES.sessions.revoke("session-other"),
      v1.common.noContentSchema,
      { method: "DELETE" },
    );
    expect(await screen.findByText("Session revoked")).toBeInTheDocument();
    expect(screen.queryByText("Chrome on Windows")).not.toBeInTheDocument();
  });

  it("unlinks an OAuth provider when email OTP remains available", async () => {
    mocks.apiFetch.mockResolvedValue(undefined);
    const browser = userEvent.setup();

    renderSettings();
    await browser.click(screen.getByRole("button", { name: "Unlink" }));
    const dialog = await screen.findByRole("dialog");
    await browser.click(
      within(dialog).getByRole("button", { name: "Unlink provider" }),
    );

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      v1.auth.ROUTES.accounts.unlink("google"),
      v1.common.noContentSchema,
      { method: "DELETE" },
    );
    expect(await screen.findByText("Google unlinked")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Unlink" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("logs out every session and returns to sign-in", async () => {
    mocks.apiFetch.mockResolvedValue({ sessionsRevoked: 2 });
    const browser = userEvent.setup();

    renderSettings();
    await browser.click(screen.getByRole("button", { name: "Sign out all" }));
    const dialog = await screen.findByRole("dialog");
    await browser.click(
      within(dialog).getByRole("button", { name: "Sign out all devices" }),
    );

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/sign-in"));
    expect(mocks.apiFetch).toHaveBeenCalledWith(
      v1.auth.ROUTES.logoutAll,
      v1.auth.logoutAllResultSchema,
      { method: "POST" },
    );
  });

  it("requires typed confirmation before deleting the account", async () => {
    mocks.apiFetch.mockResolvedValue(undefined);
    const browser = userEvent.setup();

    renderSettings();
    await browser.click(screen.getByRole("button", { name: "Delete account" }));
    const dialog = await screen.findByRole("dialog");
    const deleteButton = within(dialog).getByRole("button", {
      name: "Delete account",
    });
    expect(deleteButton).toBeDisabled();

    await browser.type(within(dialog).getByLabelText("Confirmation"), "DELETE");
    expect(deleteButton).toBeEnabled();
    await browser.click(deleteButton);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/sign-in"));
    expect(mocks.apiFetch).toHaveBeenCalledWith(
      v1.auth.ROUTES.deleteMe,
      v1.common.noContentSchema,
      { method: "DELETE" },
    );
  });
});

function renderSettings() {
  return render(
    <SessionProvider
      initialUser={{
        id: user.id,
        email: user.email,
        roles: user.roles,
      }}
    >
      <AccountSettings
        initialUser={user}
        initialSessions={sessions}
        enabledMethods={["emailOtp", "google"]}
      />
    </SessionProvider>,
  );
}
