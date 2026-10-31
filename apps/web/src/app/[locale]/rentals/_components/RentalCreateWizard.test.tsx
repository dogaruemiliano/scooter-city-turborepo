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
import { ApiError, v1 } from "@repo/api-shared";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  useCallback,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  PageHeaderNavigationContext,
  type PageHeaderNavigationOptions,
} from "@/components/PageHeaderNavigation";
import { RentalCreateWizard } from "./RentalCreateWizard";
import { RentalCreateAction } from "./RentalCreateAction";
import { WorkspaceNotifications } from "@/components/WorkspaceNotifications";
import {
  emptyRentalDraft,
  readRentalDraft,
  weeklyPeriod,
  writeRentalDraft,
} from "../_lib/rental-draft";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  post: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  user: {
    id: "staff",
    effectiveScopes: {
      "rentals.create": ["ALL"],
      "persons.create": ["ALL"],
    } as Record<string, string[]>,
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/lib/api", () => ({ webApi: { fetch: mocks.fetch } }));
vi.mock("@/components/auth/SessionProvider", () => ({
  useSession: () => ({ user: mocks.user }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: (props: ComponentProps<"a">) => <a {...props} />,
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

const person = {
  id: "person-1",
  firstName: "Ada",
  lastName: "Lovelace",
  phone: "+40712345678",
  email: "ada@example.com",
  deletedAt: null,
};
const scooter = {
  id: "scooter-1",
  fleetNumber: 7,
  brandCode: "HON",
  brand: "Honda",
  model: "Vision",
  registrationNumber: "B123",
  registrationType: "national",
  rentalInsuranceStatus: "active",
  maintenanceHoldCount: 0,
  deletedAt: null,
};
const completeDraft = () => ({
  ...emptyRentalDraft(),
  detailsCompleted: true,
  personId: person.id,
  scooterId: scooter.id,
  startDate: { day: "24", month: "10", year: "2026" },
  period: weeklyPeriod({ day: "24", month: "10", year: "2026" }),
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  mocks.user.effectiveScopes = {
    "rentals.create": ["ALL"],
    "persons.create": ["ALL"],
  };
  mocks.post.mockResolvedValue({ id: "rental-1" });
  mocks.fetch.mockImplementation((url: string, _schema, options) => {
    if (options?.method === "POST") return mocks.post(url, options);
    if (url.startsWith("/v1/rentals/quote?")) {
      const query = new URL(url, "https://fixture.test").searchParams;
      return Promise.resolve(
        v1.rentals.calculateRentalTerms(
          "without_license",
          v1.rentals.rentalPromotionSchema.parse(query.get("promotion")),
        ),
      );
    }
    return Promise.resolve({
      items: url.startsWith("/v1/persons") ? [person] : [scooter],
      page: 1,
      pageSize: 100,
      total: 1,
    });
  });
});

it("uses the authoritative quote and preserves the 28-day Bucharest promotion without recording a receipt", async () => {
  writeRentalDraft("staff", completeDraft());
  const browser = userEvent.setup();
  renderWizard();
  await loaded();
  expect(await screen.findByText(/Initial total:.*600/)).toBeVisible();
  await browser.click(
    screen.getByRole("combobox", { name: "Initial rental plan" }),
  );
  await browser.click(
    await screen.findByRole("option", { name: "3+1 · 28 days" }),
  );
  expect(await screen.findByText(/Initial total:.*1,200/)).toBeVisible();
  const draft = readRentalDraft("staff")!;
  expect(draft.promotion).toBe("three_plus_one");
  expect(draft.period?.timeZone).toBe("Europe/Bucharest");
  expect(draft.period?.endsAt).toBe(
    v1.rentals
      .addRentalCalendar(new Date(draft.period!.startsAt), 28)
      .toISOString(),
  );
  expect(mocks.post).not.toHaveBeenCalled();
});
afterEach(() => vi.restoreAllMocks());

it("blocks a returning customer's promotional plan and allows recovery to standard", async () => {
  writeRentalDraft("staff", {
    ...completeDraft(),
    promotion: "three_plus_one",
  });
  const fetch = mocks.fetch.getMockImplementation()!;
  mocks.fetch.mockImplementation((url: string, ...args) => {
    if (url.startsWith("/v1/rentals/quote?")) {
      const query = new URL(url, "https://fixture.test").searchParams;
      expect(query.get("personId")).toBe(person.id);
      if (query.get("promotion") === "three_plus_one")
        return Promise.reject(
          new ApiError(
            409,
            "New customers only",
            v1.rentals.NEW_CUSTOMER_PROMOTION_ERROR_CODE,
          ),
        );
    }
    return fetch(url, ...args);
  });
  const browser = userEvent.setup();
  renderWizard();
  expect(
    (
      await screen.findAllByText(
        /The 3\+1 offer is available only to new customers/,
      )
    ).length,
  ).toBeGreaterThan(0);
  await browser.click(
    screen.getByRole("button", { name: "Continue to review" }),
  );
  expect(readRentalDraft("staff")?.step).toBe("details");
  await browser.click(
    screen.getByRole("combobox", { name: "Initial rental plan" }),
  );
  await browser.click(
    await screen.findByRole("option", { name: "Standard · 7 days" }),
  );
  expect(await screen.findByText(/Initial total:.*600/)).toBeVisible();
  await browser.click(
    screen.getByRole("button", { name: "Continue to review" }),
  );
  expect(readRentalDraft("staff")?.step).toBe("review");
  expect(readRentalDraft("staff")?.personId).toBe(person.id);
  expect(mocks.post).not.toHaveBeenCalled();
});

function HeaderHarness({ children }: { children: ReactNode }) {
  const [navigation, setNavigation] = useState<PageHeaderNavigationOptions>({});
  const register = useCallback((options: PageHeaderNavigationOptions) => {
    setNavigation(options);
    return () => setNavigation({});
  }, []);
  return (
    <PageHeaderNavigationContext.Provider value={register}>
      <button
        aria-label="Header back"
        onClick={navigation.onBack}
        disabled={navigation.backDisabled}
      />
      {children}
    </PageHeaderNavigationContext.Provider>
  );
}

function renderWizard(
  props: Partial<ComponentProps<typeof RentalCreateWizard>> = {},
  locale: "en" | "ro" = "en",
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <WorkspaceNotifications>
        <HeaderHarness>
          <RentalCreateWizard userId="staff" {...props} />
        </HeaderHarness>
      </WorkspaceNotifications>
    </NextIntlClientProvider>,
  );
}

it("shows option failures in a reload-only toast and preserves the draft during recovery", async () => {
  const draft = completeDraft();
  let top = 500;
  let width = 600;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({
      left: 24,
      top,
      width,
      height: 120,
      right: 24 + width,
      bottom: top + 120,
      x: 24,
      y: top,
      toJSON() {},
    }),
  );
  writeRentalDraft("staff", draft);
  mocks.fetch.mockRejectedValue(new Error("Options unavailable"));
  const user = userEvent.setup();
  const view = renderWizard();
  const error = await screen.findByText("Options unavailable");
  expect(error.closest('[data-slot="toast"]')).not.toBeNull();
  const viewport = error.closest(
    '[data-slot="anchored-toast-viewport"]',
  ) as HTMLElement;
  expect(viewport.style.width).toBe("600px");
  expect(viewport.style.top).toBe("calc(500px - var(--spacing-3))");
  top = 350;
  width = 320;
  fireEvent.scroll(window);
  await waitFor(() =>
    expect(viewport.style.top).toBe("calc(350px - var(--spacing-3))"),
  );
  expect(viewport.style.width).toBe("320px");

  expect(view.container).not.toContainElement(error);
  expect(
    screen.queryByRole("button", { name: /Dismiss notification|Skip/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.getAllByRole("button", { name: "Reload options" }),
  ).toHaveLength(1);
  expect(
    screen.getByRole("button", { name: "Reload options" }),
  ).not.toHaveTextContent("Reload options");
  screen.getByRole("button", { name: "Reload options" }).focus();
  await user.keyboard("{Escape}");
  expect(screen.getByText("Options unavailable")).toBeVisible();
  let finishReload!: () => void;
  const pendingReload = new Promise<void>((resolve) => {
    finishReload = resolve;
  });
  mocks.fetch.mockImplementation((url: string) =>
    pendingReload.then(() => ({
      items: url.startsWith("/v1/persons") ? [person] : [scooter],
      page: 1,
      pageSize: 100,
      total: 1,
    })),
  );
  await user.click(screen.getByRole("button", { name: "Reload options" }));
  const reload = screen.getByRole("button", { name: "Reload options" });
  await waitFor(() => expect(reload).toHaveAttribute("aria-busy", "true"));
  expect(reload).toBeDisabled();
  expect(reload.querySelector(".animate-spin")).not.toBeNull();
  expect(screen.getByText("Options unavailable")).toBeVisible();
  const requestCount = mocks.fetch.mock.calls.length;
  await user.click(reload);
  expect(mocks.fetch).toHaveBeenCalledTimes(requestCount);
  await act(async () => finishReload());
  await waitFor(() =>
    expect(screen.queryByText("Options unavailable")).not.toBeInTheDocument(),
  );
  expect(readRentalDraft("staff")).toEqual(draft);
  expect(screen.getByText("007 HON")).toBeVisible();
});
async function loaded() {
  await waitFor(() =>
    expect(
      screen.getByRole("button", {
        name: /Continue to review|Continuă la verificare/,
      }),
    ).toBeEnabled(),
  );
}

it("uses real person/scooter selectors, calculates a week, and creates only on final confirmation", async () => {
  const user = userEvent.setup();
  renderWizard();
  await loaded();
  await user.click(screen.getByRole("button", { name: /Renter/ }));
  const personSheet = await screen.findByRole("dialog", { name: "Renter" });
  await user.type(within(personSheet).getByRole("textbox"), "ada@example.com");
  await user.click(
    within(personSheet).getByRole("button", { name: /Ada Lovelace/ }),
  );
  await waitFor(() => expect(personSheet).not.toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: /^Scooter/ }));
  const scooterSheet = await screen.findByRole("dialog", { name: "Scooter" });
  expect(scooterSheet).toHaveClass("bg-popover");
  expect(scooterSheet.className).not.toMatch(/\bbg-background\b/);
  await user.click(
    within(scooterSheet).getByRole("button", { name: /007 HON/ }),
  );
  await waitFor(() => expect(scooterSheet).not.toBeInTheDocument());
  for (const [placeholder, value] of [
    ["DD", "24"],
    ["MM", "10"],
    ["YYYY", "2026"],
  ])
    fireEvent.change(screen.getByPlaceholderText(placeholder!), {
      target: { value },
    });
  expect(screen.getByText(/First week:/)).toHaveTextContent("31");
  expect(readRentalDraft("staff")).toMatchObject({
    personId: person.id,
    scooterId: scooter.id,
    step: "details",
  });
  await user.click(screen.getByRole("button", { name: "Continue to review" }));
  expect(mocks.post).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: "Review rental" })).toHaveFocus();
  expect(readRentalDraft("staff")).toMatchObject({
    detailsCompleted: true,
    step: "review",
  });
  await user.type(screen.getByLabelText("Internal notes"), "Staff only");
  expect(readRentalDraft("staff")?.internalNotes).toBe("Staff only");
  await user.click(screen.getByRole("button", { name: "Create rental" }));
  await waitFor(() =>
    expect(mocks.replace).toHaveBeenCalledWith("/rentals/rental-1"),
  );
  expect(mocks.post).toHaveBeenCalledTimes(1);
  expect(mocks.post.mock.calls[0]![1].json).toMatchObject({
    personId: person.id,
    scooterId: scooter.id,
    internalNotes: "Staff only",
    startsAt: completeDraft().period!.startsAt,
    endsAt: completeDraft().period!.endsAt,
  });
  expect(readRentalDraft("staff")).toBeNull();
});

it("autosaves and resumes input before completing the first step", async () => {
  const view = renderWizard();
  await loaded();
  fireEvent.change(screen.getByPlaceholderText("DD"), {
    target: { value: "2" },
  });
  view.unmount();
  const action = render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <RentalCreateAction userId="staff" />
    </NextIntlClientProvider>,
  );
  expect(
    await screen.findByRole("link", { name: "Resume rental" }),
  ).toHaveAttribute("href", "/rentals/new");
  action.unmount();
  renderWizard();
  await loaded();
  expect(screen.getByPlaceholderText("DD")).toHaveValue("2");
});

it("flushes before adding a person, then restores the draft with the new person selected", async () => {
  const draft = { ...completeDraft(), customerNotes: "Keep these notes" };
  writeRentalDraft("staff", draft);
  const user = userEvent.setup();
  const view = renderWizard();
  await loaded();
  expect(
    screen.queryByRole("button", { name: "Add person" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Renter/ }));
  const personSheet = await screen.findByRole("dialog", { name: "Renter" });
  await user.click(
    within(personSheet).getByRole("button", { name: "Add person" }),
  );
  expect(mocks.push).toHaveBeenCalledWith(
    `/persons/new?returnToRental=${draft.id}`,
  );
  expect(readRentalDraft("staff")).toMatchObject(draft);
  view.unmount();
  renderWizard({ returnedDraftId: draft.id, returnedPersonId: person.id });
  await loaded();
  expect(screen.getByText("Ada Lovelace")).toBeVisible();
  expect(screen.getByText("007 HON")).toBeVisible();
  expect(readRentalDraft("staff")?.customerNotes).toBe("Keep these notes");
});

it("discards only the rental draft and sends no person deletion request", async () => {
  writeRentalDraft("staff", completeDraft());
  const user = userEvent.setup();
  renderWizard();
  await loaded();
  await user.click(screen.getByRole("button", { name: "Header back" }));
  const dialog = await screen.findByRole("dialog", {
    name: "Leave rental creation?",
  });
  expect(
    within(dialog).getByText(
      /Any person you already created will remain saved/,
    ),
  ).toBeVisible();
  await user.click(
    within(dialog).getByRole("button", { name: "Delete draft" }),
  );
  expect(mocks.replace).toHaveBeenCalledWith("/rentals");
  expect(readRentalDraft("staff")).toBeNull();
  expect(mocks.post).not.toHaveBeenCalled();
  expect(
    mocks.fetch.mock.calls.some((call) => call[2]?.method === "DELETE"),
  ).toBe(false);
});

it("keeps notes and the create label after a known server rejection", async () => {
  writeRentalDraft("staff", {
    ...completeDraft(),
    step: "review",
    internalNotes: "Keep me",
  });
  mocks.post.mockRejectedValue(new ApiError(409, "Unavailable"));
  const user = userEvent.setup();
  renderWizard();
  await user.click(
    await screen.findByRole("button", { name: "Create rental" }),
  );
  await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Create rental" })).toBeEnabled(),
  );
  expect(screen.getByLabelText("Internal notes")).toHaveValue("Keep me");
  expect(readRentalDraft("staff")?.submissionUncertain).toBe(false);
  expect(mocks.replace).not.toHaveBeenCalled();
});

it("blocks click and Enter duplicates, including after reloading during submission", async () => {
  writeRentalDraft("staff", { ...completeDraft(), step: "review" });
  let resolve!: (value: { id: string }) => void;
  mocks.post.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const user = userEvent.setup();
  const view = renderWizard();
  const button = await screen.findByRole("button", { name: "Create rental" });
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
  fireEvent.submit(button.closest("form")!);
  expect(mocks.post).toHaveBeenCalledTimes(1);
  expect(readRentalDraft("staff")?.submissionUncertain).toBe(true);
  view.unmount();
  renderWizard();
  expect(
    await screen.findByText(/The creation result is unknown/),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Create rental" })).toBeDisabled();
  await act(async () => resolve({ id: "rental-1" }));
  // Completion in an unmounted wizard must not pull the operator away from
  // whatever they navigated to while that request was pending.
  expect(mocks.replace).not.toHaveBeenCalled();
});

it("recovers an uncertain request only after the operator confirms checking its outcome", async () => {
  writeRentalDraft("staff", {
    ...completeDraft(),
    step: "review",
    internalNotes: "Preserve these notes",
  });
  mocks.post.mockRejectedValue(new TypeError("Network interrupted"));
  const user = userEvent.setup();
  renderWizard();
  const create = await screen.findByRole("button", { name: "Create rental" });
  await waitFor(() => expect(create).toBeEnabled());
  await user.click(create);
  expect(
    await screen.findByText(/The creation result is unknown/),
  ).toBeVisible();
  expect(create).toBeDisabled();
  await user.click(
    screen.getByRole("button", { name: "I checked; no rental was created" }),
  );
  await waitFor(() => expect(create).toBeEnabled());
  expect(screen.getByLabelText("Internal notes")).toHaveValue(
    "Preserve these notes",
  );
  expect(readRentalDraft("staff")?.submissionUncertain).toBe(false);
  expect(mocks.post).toHaveBeenCalledTimes(1);
});

it("retains the draft and blocks leaving for person creation when storage fails", async () => {
  writeRentalDraft("staff", completeDraft());
  const user = userEvent.setup();
  renderWizard();
  await loaded();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Quota");
  });
  expect(
    screen.queryByRole("button", { name: "Add person" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Renter/ }));
  const personSheet = await screen.findByRole("dialog", { name: "Renter" });
  await user.click(
    within(personSheet).getByRole("button", { name: "Add person" }),
  );
  expect(mocks.push).not.toHaveBeenCalled();
  expect(
    screen.getByText(/Your latest changes could not be saved/),
  ).toBeVisible();
});

it("requires replacing unavailable selections without dropping the other details", async () => {
  writeRentalDraft("staff", {
    ...completeDraft(),
    personId: "archived-person",
  });
  renderWizard();
  await loaded();
  expect(screen.getByText(/This person is no longer available/)).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: "Continue to review" }),
  );
  expect(screen.getByRole("heading", { name: "Rental details" })).toBeVisible();
  expect(screen.getByText("007 HON")).toBeVisible();
  expect(screen.getByPlaceholderText("YYYY")).toHaveValue("2026");
});

it("localizes the wizard and validates empty inputs", async () => {
  renderWizard({}, "ro");
  await loaded();
  fireEvent.change(document.getElementById("rental-start-day")!, {
    target: { value: "" },
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Continuă la verificare" }),
  );
  expect(screen.getByText("Selectează o persoană.")).toBeVisible();
  expect(
    screen.getByText("Introdu o dată de început completă și validă."),
  ).toBeVisible();
});

it("lists eligible scooters, but search reveals disabled scooters with all their blockers", async () => {
  const unavailable = {
    ...scooter,
    id: "blocked",
    fleetNumber: 8,
    registrationNumber: null,
    registrationType: "unregistered",
    rentalInsuranceStatus: "missing",
    maintenanceHoldCount: 2,
  };
  mocks.fetch.mockImplementation((url: string) =>
    Promise.resolve({
      items: url.startsWith("/v1/persons") ? [person] : [scooter, unavailable],
      page: 1,
      pageSize: 100,
      total: 2,
    }),
  );
  const user = userEvent.setup();
  renderWizard();
  await loaded();
  await user.click(screen.getByRole("button", { name: /^Scooter/ }));
  const sheet = within(await screen.findByRole("dialog", { name: "Scooter" }));
  expect(sheet.getByRole("button", { name: /007 HON/ })).toBeEnabled();
  expect(sheet.queryByRole("button", { name: /008 HON/ })).toBeNull();
  await user.type(sheet.getByRole("textbox"), "008 HON");
  expect(sheet.getByRole("button", { name: /008 HON/ })).toBeDisabled();
  for (const reason of [
    "No registration",
    "No insurance recorded",
    "Held for service",
  ])
    expect(sheet.getByText(reason)).toBeVisible();
  await user.clear(sheet.getByRole("textbox"));
  expect(sheet.queryByRole("button", { name: /008 HON/ })).toBeNull();
});

it("blocks a restored draft when its scooter is no longer eligible", async () => {
  writeRentalDraft("staff", { ...completeDraft(), step: "review" });
  mocks.fetch.mockImplementation((url: string) =>
    Promise.resolve({
      items: url.startsWith("/v1/persons")
        ? [person]
        : [{ ...scooter, rentalInsuranceStatus: "expired" }],
      page: 1,
      pageSize: 100,
      total: 1,
    }),
  );
  const user = userEvent.setup();
  renderWizard();
  const create = await screen.findByRole("button", { name: "Create rental" });
  await waitFor(() => expect(create).toBeEnabled());
  await user.click(create);
  expect(await screen.findByText("Insurance expired")).toBeVisible();
  expect(mocks.post).not.toHaveBeenCalled();
  expect(readRentalDraft("staff")?.scooterId).toBe(scooter.id);
});

it("leaves an untouched or validation-only form without saving or prompting", async () => {
  const user = userEvent.setup();
  renderWizard();
  await loaded();
  expect(
    screen.queryByRole("heading", { name: "Create rental" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Save and exit" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Delete draft" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Continue to review" }));
  expect(readRentalDraft("staff")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Header back" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(mocks.replace).toHaveBeenCalledWith("/rentals");
  expect(localStorage.length).toBe(0);
});

it("autosaves first-step edits and offers a safe exit without losing them", async () => {
  const user = userEvent.setup();
  renderWizard();
  await loaded();
  const day = screen.getByPlaceholderText("DD");
  fireEvent.change(day, { target: { value: "2" } });
  expect(readRentalDraft("staff")?.startDate.day).toBe("2");
  fireEvent.change(day, { target: { value: "24" } });
  expect(readRentalDraft("staff")?.startDate.day).toBe("24");
  await user.click(screen.getByRole("button", { name: "Header back" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Save draft" }));
  expect(mocks.replace).toHaveBeenCalledWith("/rentals");
  expect(readRentalDraft("staff")?.startDate.day).toBe("24");
  expect(mocks.post).not.toHaveBeenCalled();
});

it.each(["details", "review"] as const)(
  "offers save/discard from the header on %s and can keep editing",
  async (step) => {
    const draft = { ...completeDraft(), step };
    writeRentalDraft("staff", draft);
    const user = userEvent.setup();
    renderWizard();
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: /Continue to review|Create rental/,
        }),
      ).toBeEnabled(),
    );
    const floating = screen
      .getByRole("button", { name: /Continue to review|Create rental/ })
      .closest('[data-slot="form-actions"]')!;
    expect(
      within(floating as HTMLElement).queryByRole("button", {
        name: "Delete draft",
      }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Header back" }));
    let dialog = await screen.findByRole("dialog", {
      name: "Leave rental creation?",
    });
    const footer = dialog.querySelector(
      '[data-slot="dialog-footer"]',
    ) as HTMLElement;
    expect(within(footer).getAllByRole("button")).toHaveLength(2);
    expect(footer).toHaveClass(
      "flex-row",
      "justify-between",
      "sm:justify-between",
    );
    expect(
      within(footer).getByRole("button", { name: "Delete draft" }),
    ).toBeVisible();
    expect(
      within(footer).getByRole("button", { name: "Save draft" }),
    ).toBeVisible();
    expect(
      within(dialog).queryByRole("button", { name: "Keep editing" }),
    ).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(readRentalDraft("staff")).toEqual(draft);
    expect(mocks.replace).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Header back" }));
    dialog = await screen.findByRole("dialog", {
      name: "Leave rental creation?",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Save draft" }),
    );
    expect(mocks.replace).toHaveBeenCalledWith("/rentals");
    expect(readRentalDraft("staff")).toEqual(draft);
    expect(mocks.post).not.toHaveBeenCalled();
  },
);

it("keeps the exit dialog open with an error when saving fails", async () => {
  writeRentalDraft("staff", completeDraft());
  const user = userEvent.setup();
  renderWizard();
  await loaded();
  await user.click(screen.getByRole("button", { name: "Header back" }));
  const dialog = await screen.findByRole("dialog", {
    name: "Leave rental creation?",
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Quota");
  });
  await user.click(within(dialog).getByRole("button", { name: "Save draft" }));
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(
    within(dialog).getByText(/Your latest changes could not be saved/),
  ).toBeVisible();
  expect(
    within(dialog).getByRole("button", { name: "Save draft" }),
  ).toBeEnabled();
});

it("returns from adding a person to an empty form without saving an empty draft", async () => {
  const user = userEvent.setup();
  const view = renderWizard();
  await loaded();
  expect(
    screen.queryByRole("button", { name: "Add person" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Renter/ }));
  const personSheet = await screen.findByRole("dialog", { name: "Renter" });
  await user.click(
    within(personSheet).getByRole("button", { name: "Add person" }),
  );
  const destination = mocks.push.mock.calls[0]![0] as string;
  const draftId = new URL(destination, "https://example.test").searchParams.get(
    "returnToRental",
  )!;
  expect(draftId).toBeTruthy();
  expect(readRentalDraft("staff")).toBeNull();
  view.unmount();
  renderWizard({ returnedDraftId: draftId, returnedPersonId: person.id });
  await loaded();
  expect(screen.getByText("Ada Lovelace")).toBeVisible();
  expect(readRentalDraft("staff")).toMatchObject({
    personId: person.id,
    inputTouched: true,
  });
});

it("keeps autosaving edits after passing details and going back, including after remount", async () => {
  writeRentalDraft("staff", { ...completeDraft(), step: "review" });
  const user = userEvent.setup();
  const view = renderWizard();
  await user.click(await screen.findByRole("button", { name: "Back" }));
  await loaded();
  fireEvent.change(screen.getByPlaceholderText("DD"), {
    target: { value: "2" },
  });
  expect(readRentalDraft("staff")).toMatchObject({
    detailsCompleted: true,
    step: "details",
    startDate: { day: "2" },
  });
  view.unmount();
  renderWizard();
  await loaded();
  expect(screen.getByPlaceholderText("DD")).toHaveValue("2");
  fireEvent.change(screen.getByPlaceholderText("DD"), {
    target: { value: "3" },
  });
  expect(readRentalDraft("staff")?.startDate.day).toBe("3");
});

it("persists first-step input during the add-person round trip", async () => {
  const user = userEvent.setup();
  const view = renderWizard();
  await loaded();
  fireEvent.change(screen.getByPlaceholderText("DD"), {
    target: { value: "2" },
  });
  expect(
    screen.queryByRole("button", { name: "Add person" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Renter/ }));
  const personSheet = await screen.findByRole("dialog", { name: "Renter" });
  await user.click(
    within(personSheet).getByRole("button", { name: "Add person" }),
  );
  const draftId = new URL(
    mocks.push.mock.calls[0]![0],
    "https://example.test",
  ).searchParams.get("returnToRental")!;
  expect(readRentalDraft("staff")?.startDate.day).toBe("2");
  expect(sessionStorage.length).toBe(0);
  view.unmount();
  renderWizard({ returnedDraftId: draftId, returnedPersonId: person.id });
  await loaded();
  expect(screen.getByPlaceholderText("DD")).toHaveValue("2");
  expect(screen.getByText("Ada Lovelace")).toBeVisible();
  expect(readRentalDraft("staff")).toMatchObject({
    personId: person.id,
    startDate: { day: "2" },
  });
});

function rentalSwipe(
  viewport: HTMLElement,
  from: number,
  to: number,
  startTarget = viewport,
) {
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({
    width: 400,
  } as DOMRect);
  for (const [type, x] of [
    ["pointerdown", from],
    ["pointermove", to],
    ["pointerup", to],
  ] as const) {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: x,
      clientY: 100,
    });
    Object.defineProperties(event, {
      pointerId: { value: 1 },
      pointerType: { value: "touch" },
      isPrimary: { value: true },
    });
    fireEvent(type === "pointerdown" ? startTarget : viewport, event);
  }
}

it("uses swipes to edit and return to review without ever submitting a rental", async () => {
  writeRentalDraft("staff", {
    ...completeDraft(),
    step: "review",
    internalNotes: "Keep me",
  });
  const view = renderWizard();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Create rental" })).toBeEnabled(),
  );
  const viewport = view.container.querySelector<HTMLElement>(
    '[data-slot="wizard-viewport"]',
  )!;
  rentalSwipe(viewport, 100, 300);
  expect(screen.getByRole("heading", { name: "Rental details" })).toHaveFocus();
  expect(readRentalDraft("staff")).toMatchObject({
    step: "details",
    detailsCompleted: true,
    internalNotes: "Keep me",
  });
  rentalSwipe(
    viewport,
    300,
    100,
    screen.getByRole("button", { name: /Renter/ }),
  );
  expect(screen.getByRole("heading", { name: "Review rental" })).toHaveFocus();
  expect(readRentalDraft("staff")?.step).toBe("review");
  expect(screen.getByRole("textbox", { name: "Internal notes" })).toHaveValue(
    "Keep me",
  );
  rentalSwipe(viewport, 300, 100);
  expect(mocks.post).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: "Review rental" })).toBeVisible();
});

it("does not let a swipe bypass validation while preserving incomplete draft input", async () => {
  const view = renderWizard();
  await loaded();
  fireEvent.change(screen.getByPlaceholderText("DD"), {
    target: { value: "2" },
  });
  rentalSwipe(
    view.container.querySelector<HTMLElement>('[data-slot="wizard-viewport"]')!,
    300,
    100,
  );
  expect(screen.getByRole("heading", { name: "Rental details" })).toBeVisible();
  expect(readRentalDraft("staff")).toMatchObject({
    step: "details",
    detailsCompleted: false,
    startDate: { day: "2" },
  });
  expect(mocks.post).not.toHaveBeenCalled();
});

it("shares person document indicators without showing contact actions during creation", async () => {
  writeRentalDraft("staff", completeDraft());
  mocks.fetch.mockImplementation((url: string) =>
    Promise.resolve({
      items: url.startsWith("/v1/persons")
        ? [{ ...person, documents: [] }]
        : [scooter],
      total: 1,
      page: 1,
      pageSize: 100,
    }),
  );
  const user = userEvent.setup();
  renderWizard();
  await loaded();
  const trigger = screen.getByRole("button", { name: /Renter/ });
  expect(
    within(trigger).getByRole("img", {
      name: "Identity document: Not present",
    }),
  ).toBeVisible();
  expect(
    within(trigger).getByRole("img", { name: "Driver license: Not present" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("link", { name: "Email Ada Lovelace" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Contact" }),
  ).not.toBeInTheDocument();
  await user.click(trigger);
  const sheet = await screen.findByRole("dialog", { name: "Renter" });
  expect(
    within(sheet).getByRole("img", { name: "Identity document: Not present" }),
  ).toBeVisible();
  expect(
    within(sheet).queryByRole("link", { name: "Email Ada Lovelace" }),
  ).not.toBeInTheDocument();
});

it("does not show contact actions on rental review", async () => {
  writeRentalDraft("staff", { ...completeDraft(), step: "review" });
  renderWizard();
  await screen.findByRole("button", { name: "Create rental" });
  expect(
    screen.queryByRole("button", { name: "Contact" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Email Ada Lovelace" }),
  ).not.toBeInTheDocument();
});

it("protects browser Back and navigation links once details have been passed", async () => {
  writeRentalDraft("staff", completeDraft());
  renderWizard();
  await loaded();
  const link = document.createElement("a");
  link.href = "/en/scooters";
  document.body.append(link);
  fireEvent.click(link);
  link.remove();
  const dialog = await screen.findByRole("dialog", {
    name: "Leave rental creation?",
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  fireEvent.popState(window, { state: {} });
  expect(
    await screen.findByRole("dialog", { name: "Leave rental creation?" }),
  ).toBeVisible();
  expect(mocks.replace).not.toHaveBeenCalled();
});
