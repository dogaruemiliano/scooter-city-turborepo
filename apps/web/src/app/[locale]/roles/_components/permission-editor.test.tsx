import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import { v1 } from "@repo/api-shared";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import {
  effectiveScopes,
  inheritedScopes,
  normalizeScopes,
  PermissionEditor,
  type Grant,
} from "./permission-editor";

const role: v1.access.Role = {
  id: "mechanic",
  slug: "mechanic",
  name: "Mechanic",
  description: "",
  revision: 2,
  memberCount: 1,
  archivedAt: null,
  permissions: [
    { permissionKey: "problems.read", scopes: ["ASSIGNED", "AVAILABLE"] },
    { permissionKey: "problems.resolve", scopes: ["ALL"] },
  ],
};
function Harness({
  initial = [],
  roles = [role],
  locale = "en",
  disabled = false,
}: {
  initial?: Grant[];
  roles?: v1.access.Role[] | null;
  locale?: "en" | "ro";
  disabled?: boolean;
}) {
  const [value, setValue] = useState<Grant[]>(initial);
  return (
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <PermissionEditor
        value={value}
        onChange={setValue}
        roles={roles ?? undefined}
        disabled={disabled}
      />
      <output aria-label="stored overrides">{JSON.stringify(value)}</output>
    </NextIntlClientProvider>
  );
}
const stored = (): Grant[] =>
  JSON.parse(screen.getByLabelText("stored overrides").textContent!);
const permissionRow = (name: string) => screen.getByRole("group", { name });
const resolveRow = () => permissionRow("Service work · Resolve");
const mode = (row: HTMLElement, name: "Allow" | "Default" | "Deny") =>
  within(row).getByRole("radio", { name });

async function serviceTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("tab", { name: "Service" }));
}

describe("permission replacement editor", () => {
  it("places the mode control in the row grid and keeps Romanian choices together", () => {
    render(
      <Harness
        locale="ro"
        initial={[{ permissionKey: "scooters.read", scopes: [] }]}
        roles={[]}
      />,
    );
    const row = permissionRow("Scutere · Vizualizare");
    const modes = within(row).getByRole("radiogroup");
    expect(modes.parentElement).toHaveClass("col-span-12", "lg:col-span-4");
    expect(modes).toHaveClass("grid-cols-3");
    expect(modes).not.toHaveClass("col-span-12", "lg:col-span-4");
    expect(within(modes).getAllByRole("radio")).toHaveLength(3);
    expect(
      within(row).getByRole("combobox").parentElement?.parentElement,
    ).toHaveClass("col-span-12");
  });

  it("opens Service for a mechanic and shows inherited scopes as readouts", () => {
    render(<Harness />);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Fleet",
      "Service",
      "Rentals",
      "People",
      "Finance",
      "Client",
    ]);
    expect(screen.getByRole("tab", { name: "Service" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(mode(resolveRow(), "Default")).toBeChecked();
    expect(within(resolveRow()).getByText("All records")).toBeInTheDocument();
    expect(
      within(resolveRow()).queryByRole("combobox"),
    ).not.toBeInTheDocument();
    expect(
      within(permissionRow("Service work · View")).getByText(
        "Assigned + available",
      ),
    ).toBeInTheDocument();
    expect(stored()).toEqual([]);
  });

  it("opens Fleet for other base roles", () => {
    render(
      <Harness roles={[{ ...role, slug: "admin", name: "Administrator" }]} />,
    );
    expect(screen.getByRole("tab", { name: "Fleet" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("distinguishes replacement Allow, explicit Deny, and removing an override with Default", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await serviceTab(user);
    await user.click(mode(resolveRow(), "Allow"));
    expect(stored()).toEqual([
      { permissionKey: "problems.resolve", scopes: ["ALL"] },
    ]);
    await user.selectOptions(
      within(resolveRow()).getByRole("combobox"),
      "ASSIGNED",
    );
    expect(stored()[0]?.scopes).toEqual(["ASSIGNED"]);
    await user.click(mode(resolveRow(), "Deny"));
    expect(stored()).toEqual([
      { permissionKey: "problems.resolve", scopes: [] },
    ]);
    expect(within(resolveRow()).getByRole("combobox")).toBeDisabled();
    expect(
      within(resolveRow()).getByRole("option", { name: "No access" }),
    ).toBeInTheDocument();
    await user.click(mode(resolveRow(), "Default"));
    expect(stored()).toEqual([]);
    expect(within(resolveRow()).getByText("All records")).toBeInTheDocument();
  });

  it("starts Allow at the least permissive valid scope when there is no inherited grant", async () => {
    const user = userEvent.setup();
    render(<Harness roles={[]} />);
    await serviceTab(user);
    await user.click(mode(permissionRow("Service work · View"), "Allow"));
    expect(stored()).toEqual([
      { permissionKey: "problems.read", scopes: ["ASSIGNED"] },
    ]);
    await user.click(
      mode(permissionRow("Service work · Claim available work"), "Allow"),
    );
    expect(stored()).toContainEqual({
      permissionKey: "problems.claim",
      scopes: ["AVAILABLE"],
    });
    await user.click(screen.getByRole("tab", { name: "Client" }));
    await user.click(mode(permissionRow("Customer profile · View"), "Allow"));
    expect(stored()).toContainEqual({
      permissionKey: "portal.profile.read",
      scopes: ["OWN"],
    });
  });

  it("supports assigned plus available while making ALL exclusive", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[{ permissionKey: "problems.read", scopes: ["ASSIGNED"] }]}
      />,
    );
    await serviceTab(user);
    const scope = within(permissionRow("Service work · View")).getByRole(
      "combobox",
    );
    await user.selectOptions(scope, "ASSIGNED,AVAILABLE");
    expect(stored()[0]?.scopes).toEqual(["ASSIGNED", "AVAILABLE"]);
    await user.selectOptions(scope, "ALL");
    expect(stored()[0]?.scopes).toEqual(["ALL"]);
    await user.selectOptions(scope, "AVAILABLE");
    expect(stored()[0]?.scopes).toEqual(["AVAILABLE"]);
    expect(
      within(scope)
        .getAllByRole("option")
        .map((option) => (option as HTMLOptionElement).value),
    ).toEqual(["ASSIGNED", "AVAILABLE", "ASSIGNED,AVAILABLE", "ALL"]);
  });

  it("updates Default from live role props while keeping explicit replacement access", async () => {
    const user = userEvent.setup();
    const view = render(<Harness />);
    await serviceTab(user);
    const narrowed = {
      ...role,
      permissions: [
        {
          permissionKey: "problems.resolve" as const,
          scopes: ["ASSIGNED" as const],
        },
      ],
    };
    view.rerender(<Harness roles={[narrowed]} />);
    expect(within(resolveRow()).getByText("Assigned")).toBeInTheDocument();
    await user.click(mode(resolveRow(), "Allow"));
    view.rerender(<Harness roles={[role]} />);
    expect(mode(resolveRow(), "Allow")).toBeChecked();
    expect(within(resolveRow()).getByRole("combobox")).toHaveValue("ASSIGNED");
    await user.click(mode(resolveRow(), "Default"));
    expect(within(resolveRow()).getByText("All records")).toBeInTheDocument();
  });

  it("keeps reasons and dependencies in Details and preserves a reason across scope and mode edits", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[{ permissionKey: "problems.resolve", scopes: ["ALL"] }]}
      />,
    );
    await serviceTab(user);
    expect(within(resolveRow()).queryByRole("textbox")).not.toBeInTheDocument();
    await user.click(
      within(resolveRow()).getByRole("button", { name: "Details" }),
    );
    expect(
      within(resolveRow()).getByText("Required permissions"),
    ).toBeInTheDocument();
    expect(
      within(resolveRow()).getByText("Service work · View"),
    ).toBeInTheDocument();
    await user.type(
      within(resolveRow()).getByRole("textbox"),
      "Temporary cover",
    );
    await user.selectOptions(
      within(resolveRow()).getByRole("combobox"),
      "ASSIGNED",
    );
    expect(stored()[0]).toEqual({
      permissionKey: "problems.resolve",
      scopes: ["ASSIGNED"],
      reason: "Temporary cover",
    });
    await user.click(mode(resolveRow(), "Deny"));
    expect(stored()[0]).toEqual({
      permissionKey: "problems.resolve",
      scopes: [],
      reason: "Temporary cover",
    });
    await user.click(mode(resolveRow(), "Allow"));
    expect(stored()[0]).toEqual({
      permissionKey: "problems.resolve",
      scopes: ["ALL"],
      reason: "Temporary cover",
    });
    await user.click(mode(resolveRow(), "Default"));
    expect(stored()).toEqual([]);
    expect(within(resolveRow()).queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("filters across tabs without losing edits and includes explicit denials in Only custom", async () => {
    const user = userEvent.setup();
    render(
      <Harness initial={[{ permissionKey: "problems.resolve", scopes: [] }]} />,
    );
    await user.click(screen.getByRole("button", { name: /Only custom/ }));
    expect(screen.getByRole("tab", { name: /^Service/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(mode(resolveRow(), "Deny")).toBeChecked();
    expect(
      screen.queryByRole("group", { name: "Service work · View" }),
    ).not.toBeInTheDocument();
    await user.type(screen.getByRole("searchbox"), "no matching permission");
    expect(
      screen.getByText("No permissions match these filters"),
    ).toBeInTheDocument();
    expect(stored()[0]?.scopes).toEqual([]);
    await user.clear(screen.getByRole("searchbox"));
    await user.click(mode(resolveRow(), "Default"));
    expect(screen.getByText("No custom permissions")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Show all permissions" }),
    );
    expect(screen.getByRole("tab", { name: "Service" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it.each([
    {
      locale: "en" as const,
      query: "settlements",
      name: "Settlements · Preview",
      category: "Finance",
    },
    {
      locale: "ro" as const,
      query: "inchirieri",
      name: "Închirieri · Predare",
      category: "Închirieri",
    },
  ])(
    "searches translated labels across categories in $locale",
    async ({ locale, query, name, category }) => {
      const user = userEvent.setup();
      render(<Harness locale={locale} />);
      await user.type(screen.getByRole("searchbox"), query);
      expect(permissionRow(name)).toBeInTheDocument();
      expect(
        screen.getByRole("tab", { name: new RegExp(`^${category}`) }),
      ).toHaveAttribute("aria-selected", "true");
    },
  );

  it("uses Allow and Deny for role editing and omits empty role grants", async () => {
    const user = userEvent.setup();
    render(<Harness roles={null} />);
    await serviceTab(user);
    const row = permissionRow("Service work · Claim available work");
    expect(
      within(row).queryByRole("radio", { name: "Default" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Only custom/ }),
    ).not.toBeInTheDocument();
    await user.click(mode(row, "Allow"));
    expect(stored()).toEqual([
      { permissionKey: "problems.claim", scopes: ["AVAILABLE"] },
    ]);
    await user.click(mode(row, "Deny"));
    expect(stored()).toEqual([]);
  });

  it("disables mutations while leaving search, category navigation, and details available", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        disabled
        initial={[
          {
            permissionKey: "problems.resolve",
            scopes: ["ASSIGNED"],
            reason: "Assigned work only",
          },
        ]}
      />,
    );
    await user.type(screen.getByRole("searchbox"), "Resolve");
    for (const radio of within(resolveRow()).getAllByRole("radio"))
      expect(radio).toBeDisabled();
    expect(within(resolveRow()).getByRole("combobox")).toBeDisabled();
    await user.click(
      within(resolveRow()).getByRole("button", { name: "Details" }),
    );
    expect(within(resolveRow()).getByRole("textbox")).toBeDisabled();
    await user.click(mode(resolveRow(), "Deny"));
    expect(stored()[0]).toEqual({
      permissionKey: "problems.resolve",
      scopes: ["ASSIGNED"],
      reason: "Assigned work only",
    });
  });

  it("supports keyboard category navigation and native radio arrow keys", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByRole("tab", { name: "Fleet" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Service" })).toHaveFocus();
    await user.keyboard(" ");
    mode(resolveRow(), "Default").focus();
    await user.keyboard("{ArrowLeft}");
    expect(mode(resolveRow(), "Allow")).toBeChecked();
    expect(stored()[0]?.scopes).toEqual(["ALL"]);
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(mode(resolveRow(), "Deny")).toBeChecked();
    expect(stored()[0]?.scopes).toEqual([]);
  });

  it("preserves normalization, inheritance unions and per-user replacement semantics", () => {
    expect(normalizeScopes(["ASSIGNED", "ALL", "AVAILABLE"])).toEqual(["ALL"]);
    expect(inheritedScopes([role], "problems.read")).toEqual([
      "ASSIGNED",
      "AVAILABLE",
    ]);
    expect(
      effectiveScopes(
        [role],
        [{ permissionKey: "problems.resolve", scopes: ["ASSIGNED"] }],
      )["problems.resolve"],
    ).toEqual(["ASSIGNED"]);
    expect(
      effectiveScopes(
        [role],
        [{ permissionKey: "problems.resolve", scopes: [] }],
      )["problems.resolve"],
    ).toEqual([]);
  });

  it("covers every permission and its translated description in both languages", async () => {
    const user = userEvent.setup();
    const view = render(<Harness roles={null} />);
    for (const locale of ["en", "ro"] as const) {
      view.rerender(<Harness roles={null} locale={locale} key={locale} />);
      let count = 0;
      for (const tab of screen.getAllByRole("tab")) {
        await user.click(tab);
        count += within(
          screen.getByRole("tabpanel", { name: tab.textContent! }),
        ).getAllByRole("group").length;
      }
      expect(count).toBe(v1.access.permissionCatalog.length);
      expect(view.container.textContent).not.toContain("access.descriptions.");
      expect(view.container.textContent).not.toContain("access.editor.");
    }
  });
});
