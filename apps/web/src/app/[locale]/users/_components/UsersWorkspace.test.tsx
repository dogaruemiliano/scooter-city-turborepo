import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UsersWorkspace } from "./UsersWorkspace";
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ webApi: { fetch: mocks.fetch } }));
vi.mock("@/i18n/navigation", () => ({
  Link: (props: ComponentProps<"a">) => <a {...props} />,
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
}));
const mechanic = {
  id: "mechanic",
  slug: "mechanic",
  name: "Mechanic",
  description: "Manage assigned repairs",
  revision: 2,
  memberCount: 1,
  archivedAt: null,
  permissions: [{ permissionKey: "problems.read", scopes: ["ASSIGNED"] }],
};
const admin = {
  ...mechanic,
  id: "admin",
  slug: "admin",
  name: "Admin",
  permissions: [{ permissionKey: "problems.read", scopes: ["ALL"] }],
};
const member = {
  id: "member",
  email: "alex@example.test",
  firstName: "Alex",
  lastName: "Ionescu",
  roles: [mechanic],
  overrides: [],
  accessRevision: 4,
  loginStatus: "ACTIVE",
  isSuperAdmin: false,
  personId: null,
  portalEligible: false,
  invitation: null,
  effectiveScopes: { "problems.read": ["ASSIGNED"] },
};
beforeEach(() => {
  mocks.fetch.mockReset();
  mocks.replace.mockReset();
  mocks.push.mockReset();
  mocks.fetch.mockImplementation(
    async (path: string, _schema: unknown, options?: { method?: string }) => {
      if (path === "/v1/access/roles")
        return {
          items: [
            mechanic,
            admin,
            {
              ...mechanic,
              id: "old",
              slug: "rental-agent",
              name: "Rental agent",
            },
          ],
        };
      if (path.startsWith("/v1/users?")) return { items: [member], total: 1 };
      if (path.endsWith("/audit-events")) return { items: [] };
      if (path.endsWith("/preview"))
        return {
          before: member.effectiveScopes,
          after: { "problems.read": ["ALL"] },
          missingPrerequisites: [],
        };
      if (options?.method)
        return { ...member, id: "new-user", accessRevision: 5 };
      return member;
    },
  );
});
function mount(id?: string) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <UsersWorkspace id={id} />
    </NextIntlClientProvider>,
  );
}
describe("member access workspace", () => {
  it("shows member cards, only fixed base roles, and one selected base role", async () => {
    mount("member");
    const select = await screen.findByRole("combobox", { name: "Base role" });
    expect(select).toHaveValue("mechanic");
    expect(
      within(select).queryByRole("option", { name: "Rental agent" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Alex Ionescu/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.queryByRole("button", { name: "Suspend account" }),
    ).not.toBeInTheDocument();
  });
  it("reviews a single-role replacement before saving and Cancel restores the original", async () => {
    const user = userEvent.setup();
    mount("member");
    const select = await screen.findByRole("combobox", { name: "Base role" });
    await user.selectOptions(select, "admin");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("combobox", { name: "Base role" })).toHaveValue(
      "mechanic",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Base role" }),
      "admin",
    );
    await user.click(screen.getByRole("button", { name: "Review changes" }));
    await screen.findByRole("button", { name: "Confirm changes" });
    expect(
      mocks.fetch.mock.calls.filter((call) => call[2]?.method === "PUT"),
    ).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Confirm changes" }));
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        "/v1/users/member/access",
        expect.anything(),
        {
          method: "PUT",
          json: {
            expectedRevision: 4,
            roles: [{ id: "admin", revision: 2 }],
            overrides: [],
          },
        },
      ),
    );
  });
  it("protects unsaved changes when navigating and blocks account actions until resolved", async () => {
    const user = userEvent.setup();
    mount("member");
    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Base role" }),
      "admin",
    );
    await user.click(screen.getByRole("button", { name: "Account access" }));
    expect(
      screen.getByRole("button", { name: "Suspend account" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("link", { name: "Roles" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("combobox", { name: "Base role" })).toHaveValue(
      "admin",
    );
    await user.click(screen.getByRole("link", { name: "Roles" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(mocks.push).toHaveBeenCalledWith("/roles");
  });
  it("creates a member with a single base role after review", async () => {
    const user = userEvent.setup();
    mount("new");
    await user.type(
      await screen.findByRole("textbox", { name: "Email" }),
      "new@example.test",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Base role" }),
      "mechanic",
    );
    await user.click(screen.getByRole("button", { name: "Review changes" }));
    expect(
      mocks.fetch.mock.calls.filter((call) => call[2]?.method),
    ).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Confirm changes" }));
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith("/v1/users", expect.anything(), {
        method: "POST",
        json: {
          email: "new@example.test",
          firstName: "",
          lastName: "",
          roles: [{ id: "mechanic", revision: 2 }],
          overrides: [],
        },
      }),
    );
  });
  it("shows Super Admin as protected and does not offer misleading permission overrides", async () => {
    mocks.fetch.mockImplementation(async (path: string) =>
      path === "/v1/access/roles"
        ? { items: [mechanic, admin] }
        : path.startsWith("/v1/users?")
          ? { items: [member], total: 1 }
          : { ...member, isSuperAdmin: true },
    );
    mount("member");
    expect(
      await screen.findByRole("combobox", { name: "Base role" }),
    ).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Base role" })).toHaveValue(
      "super-admin",
    );
    expect(
      screen.queryByRole("button", { name: "Review changes" }),
    ).not.toBeInTheDocument();
  });
});
