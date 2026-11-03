import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import { it, expect, vi, beforeEach } from "vitest";
import {
  PageHeaderNavigationContext,
  type PageHeaderNavigationOptions,
} from "@/components/PageHeaderNavigation";
import { PersonCreateForm } from "./PersonCreateForm";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  register: vi.fn((options: PageHeaderNavigationOptions) => {
    void options;
    return () => {};
  }),
}));
vi.mock("@/lib/api", () => ({ webApi: { fetch: mocks.fetch } }));
vi.mock("next/navigation", () => ({
  useRouter: () => mocks,
}));
vi.mock("@/components/auth/SessionProvider", () => ({
  useOptionalSession: () => ({
    user: { effectiveScopes: { "persons.create": ["ALL"] } },
  }),
}));

it.each([undefined, "rental-draft"])(
  "creates a contact and returns to the correct destination (%s)",
  async (rentalDraftId) => {
    mocks.fetch.mockClear();
    mocks.push.mockClear();
    mocks.fetch.mockResolvedValue({ id: "new-person" });
    const browser = userEvent.setup();
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <PersonCreateForm
          personsHref="/en/persons"
          rentalDraftId={rentalDraftId}
        />
      </NextIntlClientProvider>,
    );
    expect(
      screen.queryByRole("list", { name: "Add person progress" }),
    ).not.toBeInTheDocument();
    for (const [label, value] of [
      ["First name", "Ada"],
      ["Last name", "Lovelace"],
      ["Email", "ada@example.com"],
      ["Phone", "712345678"],
      ["Address line 1", "1 Test Street"],
    ]) {
      fireEvent.change(screen.getByLabelText(label!), { target: { value } });
    }
    for (const [label, value] of [
      ["County", "București"],
      ["Locality", "Sector 3"],
    ]) {
      await browser.click(
        screen.getByRole("button", { name: new RegExp(`^${label}(?: |$)`) }),
      );
      const dialog = await screen.findByRole("dialog", { name: label });
      await browser.click(within(dialog).getByRole("button", { name: value }));
      await waitFor(() => expect(dialog).not.toBeInTheDocument());
    }
    await browser.click(screen.getByRole("button", { name: "Create person" }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
    const payload = mocks.fetch.mock.calls[0]![2].json;
    expect(payload).toMatchObject({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      phone: "+40712345678",
    });
    expect(payload).not.toHaveProperty("documents");
    expect(payload).not.toHaveProperty("documentWorkflow");
    expect(mocks.push).toHaveBeenCalledWith(
      rentalDraftId
        ? "/en/rentals/new?draftId=rental-draft&personId=new-person"
        : "/en/persons/new-person",
    );
  },
);

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/en/persons/new");
});
function mount() {
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <PageHeaderNavigationContext value={mocks.register}>
        <PersonCreateForm personsHref="/en/persons" />
      </PageHeaderNavigationContext>
    </NextIntlClientProvider>,
  );
}
function back() {
  mocks.register.mock.calls.at(-1)![0].onBack!();
}

it("leaves an empty contact form immediately and places Cancel in the desktop-only slot", () => {
  mount();
  expect(
    screen.getByRole("link", { name: "Cancel" }).parentElement,
  ).toHaveClass("hidden", "md:flex");
  act(back);
  expect(mocks.replace).toHaveBeenCalledWith("/en/persons");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it("protects typed contact details on header and browser Back without writing them", async () => {
  const user = userEvent.setup();
  mount();
  await user.type(screen.getByLabelText("First name"), "Ada");
  act(back);
  expect(
    screen.getByRole("dialog", { name: "Discard unsaved changes?" }),
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Keep editing" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(screen.getByLabelText("First name")).toHaveValue("Ada");
  fireEvent.popState(window, { state: {} });
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(mocks.fetch).not.toHaveBeenCalled();
});
