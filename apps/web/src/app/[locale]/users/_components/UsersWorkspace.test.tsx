import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UsersWorkspace } from "./UsersWorkspace";
const mocks = vi.hoisted(() => ({
  actor: {
    id: "super",
    isSuperAdmin: true,
    effectiveScopes: {} as Record<string, string[]>,
  },
  fetch: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/components/auth/SessionProvider", () => ({
  useSession: () => ({ user: mocks.actor }),
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
  mocks.actor = { id: "super", isSuperAdmin: true, effectiveScopes: {} };
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
            { ...mechanic, id: "customer", slug: "customer", name: "Client" },
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
async function pickRole(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
) {
  await user.click(await screen.findByRole("button", { name: "Base role" }));
  const sheet = await screen.findByRole("dialog", { name: "Base role" });
  await user.click(within(sheet).getByRole("button", { name: label }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Base role" })).toBeNull(),
  );
}

describe("member access workspace", () => {
  it("labels the directory action as adding a team member", async () => {
    mount();
    expect(
      await screen.findByRole("link", { name: "Add team member" }),
    ).toHaveAttribute("href", "/users/new");
  });

  it("uses the shared role colors in the directory", async () => {
    const users = [
      {
        ...member,
        id: "super",
        email: "super@example.test",
        isSuperAdmin: true,
      },
      { ...member, id: "admin", email: "admin@example.test", roles: [admin] },
      member,
      {
        ...member,
        id: "client",
        email: "client@example.test",
        roles: [
          { ...mechanic, id: "customer", slug: "customer", name: "Client" },
        ],
      },
    ];
    const fetchNormally = mocks.fetch.getMockImplementation()!;
    mocks.fetch.mockImplementation(async (path, ...args) =>
      path.startsWith("/v1/users?")
        ? { items: users, total: users.length }
        : fetchNormally(path, ...args),
    );
    mount();
    for (const [label, color] of [
      ["Super Admin", "text-personal"],
      ["Admin", "text-info"],
      ["Mechanic", "text-warning-text"],
      ["Client", "text-success"],
    ]) {
      expect(await screen.findByText(label!)).toHaveClass(color!);
    }
  });

  it("confirms dependency changes inside the permissions sheet without closing it", async () => {
    const user = userEvent.setup();
    const dependentRole = {
      ...mechanic,
      permissions: [
        { permissionKey: "problems.read", scopes: ["ALL"] },
        { permissionKey: "problems.update", scopes: ["ASSIGNED"] },
      ],
    };
    mocks.fetch.mockImplementation(async (path: string) =>
      path === "/v1/access/roles"
        ? { items: [dependentRole, admin] }
        : { ...member, roles: [dependentRole] },
    );
    mount("member");
    await user.click(
      await screen.findByRole("button", { name: /^Customize permissions/ }),
    );
    const sheet = await screen.findByRole("dialog", {
      name: "Customize permissions",
    });
    const row = within(sheet).getByRole("group", {
      name: "Service work · View",
    });
    await user.click(within(row).getByRole("radio", { name: "Deny" }));
    const confirmation = await screen.findByRole("dialog", {
      name: "Update dependent permissions?",
    });
    await user.click(
      within(confirmation).getByRole("button", {
        name: "Disable all 2 permissions",
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Update dependent permissions?" }),
      ).toBeNull(),
    );
    expect(sheet).toBeVisible();
    const edit = within(sheet).getByRole("group", {
      name: "Service work · Edit",
    });
    expect(within(edit).getByRole("radio", { name: "Deny" })).toBeChecked();
    expect(within(row).getByRole("radio", { name: "Deny" })).toBeChecked();
  });

  it("reviews and confirms permission changes in a nested sheet, preserving drafts when going back", async () => {
    const user = userEvent.setup();
    const fetchNormally = mocks.fetch.getMockImplementation()!;
    mocks.fetch.mockImplementation(async (path, ...args) =>
      path.endsWith("/preview")
        ? {
            before: member.effectiveScopes,
            after: {},
            missingPrerequisites: [],
          }
        : fetchNormally(path, ...args),
    );
    mount("member");
    await user.click(
      await screen.findByRole("button", { name: /Customize permissions/ }),
    );
    const sheet = await screen.findByRole("dialog", {
      name: "Customize permissions",
    });
    const row = within(sheet).getByRole("group", {
      name: "Service work · View",
    });
    await user.click(within(row).getByRole("radio", { name: "Deny" }));
    await user.click(
      within(sheet).getByRole("button", { name: "Review changes" }),
    );
    const review = await screen.findByRole("dialog", {
      name: "Review effective access",
    });
    expect(review).toHaveClass("bg-popover");
    expect(review).not.toHaveClass("bg-background");
    expect(sheet).toHaveAttribute("data-nested-drawer-open");
    expect(within(review).getByText("Removed")).toHaveClass("text-destructive");
    expect(
      within(review).getByRole("button", { name: "Confirm changes" }),
    ).toHaveClass("bg-destructive");
    expect(
      mocks.fetch.mock.calls.filter((call) => call[2]?.method === "PUT"),
    ).toHaveLength(0);
    await user.click(
      within(review).getByRole("button", { name: "Keep editing" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Review effective access" }),
      ).toBeNull(),
    );
    expect(within(row).getByRole("radio", { name: "Deny" })).toBeChecked();
    await user.click(
      within(sheet).getByRole("button", { name: "Review changes" }),
    );
    const reopened = await screen.findByRole("dialog", {
      name: "Review effective access",
    });
    await user.click(
      within(reopened).getByRole("button", { name: "Confirm changes" }),
    );
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        "/v1/users/member/access",
        expect.anything(),
        {
          method: "PUT",
          json: {
            expectedRevision: 4,
            roles: [{ id: "mechanic", revision: 2 }],
            overrides: [{ permissionKey: "problems.read", scopes: [] }],
          },
        },
      ),
    );
  });

  it("blocks confirmation in the review sheet when the preview reports missing prerequisites", async () => {
    const user = userEvent.setup();
    const fetchNormally = mocks.fetch.getMockImplementation()!;
    mocks.fetch.mockImplementation(async (path, ...args) =>
      path.endsWith("/preview")
        ? {
            before: member.effectiveScopes,
            after: { "problems.resolve": ["ALL"] },
            missingPrerequisites: ["problems.read"],
          }
        : fetchNormally(path, ...args),
    );
    mount("member");
    await pickRole(user, "Admin");
    await user.click(screen.getByRole("button", { name: "Review changes" }));
    const review = await screen.findByRole("dialog", {
      name: "Review effective access",
    });
    expect(
      within(review).getByRole("button", { name: "Confirm changes" }),
    ).toBeDisabled();
    expect(within(review).getByRole("alert")).toHaveTextContent(
      "Required permissions",
    );
    expect(
      mocks.fetch.mock.calls.filter((call) => call[2]?.method === "PUT"),
    ).toHaveLength(0);
  });

  it("customizes permissions in a sheet and summarizes retained changes beside the role", async () => {
    const user = userEvent.setup();
    mount("member");
    await user.click(
      await screen.findByRole("button", { name: /Customize permissions/ }),
    );
    const sheet = await screen.findByRole("dialog", {
      name: "Customize permissions",
    });
    expect(sheet).toHaveClass("bg-popover");
    const tabBar = within(sheet).getByRole("tablist").parentElement;
    expect(tabBar).toHaveClass("sticky", "top-0", "bg-popover");
    expect(tabBar?.closest('[data-slot="bottom-sheet-body"]')).toHaveClass(
      "pt-0",
    );
    expect(
      within(sheet).queryByRole("heading", { name: "Service" }),
    ).toBeNull();
    expect(sheet).not.toHaveClass("bg-background");
    for (const surface of sheet.querySelectorAll(
      '[data-slot="bottom-sheet-body"], [data-slot="bottom-sheet-header"], [data-slot="bottom-sheet-footer"]',
    )) {
      expect(surface).not.toHaveClass("bg-background");
    }
    const row = within(sheet).getByRole("group", {
      name: "Service work · View",
    });
    await user.click(within(row).getByRole("radio", { name: "Allow" }));
    await user.click(
      within(row).getByRole("button", {
        name: "Scope for Service work · View",
      }),
    );
    const scopeSheet = await screen.findByRole("dialog", {
      name: "Scope for Service work · View",
    });
    expect(scopeSheet).toHaveClass("bg-popover");
    expect(scopeSheet).not.toHaveClass("bg-background");
    await user.click(
      within(scopeSheet).getByRole("button", {
        name: "All records",
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Scope for Service work · View" }),
      ).toBeNull(),
    );
    expect(sheet).toBeVisible();
    expect(
      within(row).getByRole("button", {
        name: "Scope for Service work · View",
      }),
    ).toHaveTextContent("All records");
    await user.click(within(row).getByRole("radio", { name: "Deny" }));
    await user.click(within(sheet).getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /Customize permissions/ }),
      ).toBeNull(),
    );
    const permissionButton = screen.getByRole("button", {
      name: /Customize permissions.*Custom changes/,
    });
    expect(permissionButton).toHaveTextContent(
      "Custom changes · 0 allowed, 1 denied",
    );
    expect(permissionButton.closest('[data-slot="field"]')).toContainElement(
      screen.getByRole("button", { name: /Base role/ }),
    );
    await user.click(permissionButton);
    const reopened = await screen.findByRole("dialog", {
      name: "Customize permissions",
    });
    expect(
      within(
        within(reopened).getByRole("group", { name: "Service work · View" }),
      ).getByRole("radio", { name: "Deny" }),
    ).toBeChecked();
  });

  it("lets a delegated admin edit non-admin users without offering the Admin role", async () => {
    const user = userEvent.setup();
    mocks.actor = {
      id: "ordinary-admin",
      isSuperAdmin: false,
      effectiveScopes: {
        "users.read": ["ALL"],
        "roles.read": ["ALL"],
        "users.roles.update": ["ALL"],
        "users.permissions.update": ["ALL"],
        "problems.read": ["ALL"],
      },
    };
    mount("member");
    await user.click(await screen.findByRole("button", { name: "Base role" }));
    const sheet = await screen.findByRole("dialog", { name: "Base role" });
    expect(within(sheet).queryByRole("button", { name: "Admin" })).toBeNull();
    expect(
      within(sheet).getByRole("button", { name: "Mechanic" }),
    ).toBeEnabled();
    await user.click(within(sheet).getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Account access" }));
    expect(screen.queryByRole("button", { name: /Super Admin/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Suspend account" }),
    ).toBeNull();
  });

  it("makes an Admin user's role and permissions read-only for a delegated admin", async () => {
    mocks.actor = {
      id: "ordinary-admin",
      isSuperAdmin: false,
      effectiveScopes: {
        "users.read": ["ALL"],
        "roles.read": ["ALL"],
        "users.roles.update": ["ALL"],
        "users.permissions.update": ["ALL"],
      },
    };
    mocks.fetch.mockImplementation(async (path: string) =>
      path === "/v1/access/roles"
        ? { items: [mechanic, admin] }
        : { ...member, roles: [admin] },
    );
    mount("member");
    expect(
      await screen.findByRole("button", { name: "Base role" }),
    ).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Review changes" })).toBeNull();
  });

  it("shows only the full-width directory until a user is opened", async () => {
    const { container } = mount();
    expect(
      await screen.findByRole("link", { name: /Alex Ionescu/ }),
    ).toHaveAttribute("href", "/users/member");
    const layout = container.querySelector(
      '[data-slot="users-workspace-layout"]',
    )!;
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(layout.children).toHaveLength(1);
    expect(layout).not.toHaveClass("xl:grid-cols-4");
    expect(layout.innerHTML).not.toContain(
      "xl:max-h-(--container-access-directory)",
    );
    expect(screen.queryByRole("button", { name: "Base role" })).toBeNull();
  });

  it("shows only the user editor without duplicate page navigation", async () => {
    const { container } = mount("member");
    await screen.findByRole("button", { name: "Base role" });
    expect(container.querySelector("#member-directory-list")).toBeNull();
    expect(screen.queryByRole("link", { name: "Back" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Roles" })).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Edit permissions" }),
    ).toBeNull();
    expect(
      screen.queryByText(messages.en.workspace.access.member.editorHelp),
    ).toBeNull();
    expect(
      screen.queryByRole("link", {
        name: messages.en.workspace.access.member.closeEditor,
      }),
    ).toBeNull();
    expect(
      screen.queryByText(messages.en.workspace.access.member.subtitle),
    ).toBeNull();
    expect(
      mocks.fetch.mock.calls.some(([url]) =>
        String(url).startsWith("/v1/users?"),
      ),
    ).toBe(false);
  });

  it("shows user details, only fixed base roles, and one selected base role", async () => {
    mount("member");
    const select = await screen.findByRole("button", { name: "Base role" });
    expect(select).toHaveTextContent("Mechanic");
    expect(select).toHaveTextContent(
      "Claim available repairs and work on assigned scooters.",
    );
    await userEvent.setup().click(select);
    const sheet = await screen.findByRole("dialog", { name: "Base role" });
    expect(sheet).toHaveClass("bg-popover");
    expect(sheet.querySelector(".bg-background")).toBeNull();
    expect(
      within(sheet)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label"))
        .filter((label) =>
          ["Admin", "Mechanic", "Client", "No role"].includes(label ?? ""),
        ),
    ).toEqual(["Admin", "Mechanic", "Client", "No role"]);
    const mechanicCard = within(sheet).getByRole("button", {
      name: "Mechanic",
    });
    expect(mechanicCard).toHaveAttribute("aria-current", "true");
    expect(mechanicCard.querySelector("svg")).not.toBeNull();
    expect(mechanicCard).toHaveTextContent("Claim available repairs");
    expect(mechanicCard).toHaveClass("rounded-xl", "border");
    expect(
      within(sheet).getByRole("button", { name: "Admin" }),
    ).toHaveTextContent("Manage the fleet");
    expect(
      within(sheet).getByRole("button", { name: "No role" }),
    ).toHaveTextContent("No inherited permissions");
    expect(
      within(sheet).queryByRole("button", { name: "Rental agent" }),
    ).toBeNull();
    await userEvent
      .setup()
      .click(within(sheet).getByRole("button", { name: "Cancel" }));
    expect(
      within(select).queryByRole("option", { name: "Rental agent" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Alex Ionescu" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Suspend account" }),
    ).not.toBeInTheDocument();
  });
  it("can select No role and show its card in the trigger", async () => {
    const user = userEvent.setup();
    mount("member");
    await pickRole(user, "No role");
    const trigger = screen.getByRole("button", { name: "Base role" });
    expect(trigger).toHaveTextContent("No role");
    expect(trigger).toHaveTextContent("No inherited permissions");
    await user.click(screen.getByRole("button", { name: "Review changes" }));
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        "/v1/users/member/access/preview",
        expect.anything(),
        {
          method: "POST",
          json: { expectedRevision: 4, roles: [], overrides: [] },
        },
      ),
    );
  });
  it("reviews a single-role replacement before saving and Cancel restores the original", async () => {
    const user = userEvent.setup();
    mount("member");
    await screen.findByRole("button", { name: "Base role" });
    await pickRole(user, "Admin");
    await user.click(
      screen.getByRole("button", { name: /Customize permissions/ }),
    );
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.getByRole("button", { name: "Base role" })).toHaveTextContent(
      "Mechanic",
    );
    await pickRole(user, "Admin");
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
  it("blocks account actions while role changes are unsaved", async () => {
    const user = userEvent.setup();
    mount("member");
    await pickRole(user, "Admin");
    await user.click(screen.getByRole("button", { name: "Account access" }));
    expect(
      screen.getByRole("button", { name: "Suspend account" }),
    ).toBeDisabled();
  });
  it("creates a member with a single base role after review", async () => {
    const user = userEvent.setup();
    mount("new");
    await user.type(
      await screen.findByRole("textbox", { name: "Email" }),
      "new@example.test",
    );
    await pickRole(user, "Mechanic");
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
      await screen.findByRole("button", { name: "Base role" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Base role" })).toHaveTextContent(
      "Super Admin",
    );
    expect(
      screen.queryByRole("button", { name: "Review changes" }),
    ).not.toBeInTheDocument();
  });
});
