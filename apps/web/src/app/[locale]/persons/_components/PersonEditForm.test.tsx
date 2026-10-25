import { v1 } from "@repo/api-shared";
import { messages, type SupportedLocale } from "@repo/i18n";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PageHeaderNavigationContext } from "@/components/PageHeaderNavigation";

import { PersonEditForm } from "./PersonEditForm";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
  registerNavigation: vi.fn((options: { onBack?: () => void }) => {
    void options;
    return () => {};
  }),
}));

vi.mock("@/lib/api", () => ({
  webApi: {
    fetch: mocks.apiFetch,
    url: (path: string) => `https://api.test${path}`,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mocks.refresh,
    push: mocks.push,
    back: mocks.back,
  }),
}));

const person: v1.persons.Person = {
  id: "person-1",
  email: "ada@example.com",
  phone: "+40712345678",
  cnp: "1900228123450",
  firstName: "Ada",
  lastName: "Lovelace",
  dateOfBirth: "1990-02-28",
  addressLine1: "1 Computation Way",
  addressLine2: null,
  city: "Bucharest",
  region: "București",
  countryCode: "RO",
  documents: [],
  notes: "Frequent renter",
  createdAt: "2026-06-25T10:00:00.000Z",
  updatedAt: "2026-06-25T11:00:00.000Z",
  deletedAt: null,
};

afterEach(() => vi.unstubAllGlobals());

beforeEach(() => {
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn(() => "blob:portrait");
      static revokeObjectURL = vi.fn();
    },
  );
  mocks.apiFetch.mockReset();
  mocks.refresh.mockReset();
  mocks.push.mockReset();
  mocks.back.mockReset();
  mocks.registerNavigation.mockClear();
});

describe("PersonEditForm", () => {
  it("confirms Back only for unsaved changes and offers no Cancel button", async () => {
    const browser = userEvent.setup();
    renderEditForm();
    const back = () =>
      mocks.registerNavigation.mock.calls.at(-1)?.[0].onBack?.();
    act(back);
    expect(mocks.back).toHaveBeenCalledOnce();
    mocks.back.mockClear();
    await browser.type(screen.getByLabelText("First name"), " changed");
    expect(
      screen.queryByRole("link", { name: "Cancel" }),
    ).not.toBeInTheDocument();
    act(back);
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Discard unsaved changes?",
    );
    expect(mocks.back).not.toHaveBeenCalled();
    await browser.click(screen.getByRole("button", { name: "Keep editing" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText("First name")).toHaveValue("Ada changed");
    act(back);
    await browser.click(
      screen.getByRole("button", { name: "Discard changes" }),
    );
    expect(mocks.back).toHaveBeenCalledOnce();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("stages a picture and fields for the main sticky submit action", async () => {
    const browser = userEvent.setup();
    mocks.apiFetch.mockResolvedValue({ ...person, avatarAssetId: "picture-1" });
    const { container } = renderEditForm();
    expect(
      screen.queryByRole("button", { name: "Save changes" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Profile picture")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save picture" }),
    ).not.toBeInTheDocument();
    await browser.clear(screen.getByLabelText("First name"));
    await browser.type(screen.getByLabelText("First name"), "Grace");
    const file = new File(["png bytes"], "portrait.png", { type: "image/png" });
    await browser.upload(screen.getByLabelText("Choose a picture"), file);
    expect(mocks.apiFetch).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-slot="form-actions"]'),
    ).toHaveAttribute("data-sticky", "true");
    expect(container.querySelector('[data-slot="form-actions"]')).toHaveClass(
      "slide-in-from-bottom-4",
    );
    await browser.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/en/persons/person-1"),
    );
    expect(mocks.apiFetch.mock.calls[0]?.[0]).toBe(
      v1.persons.ROUTES.update(person.id),
    );
    const call = mocks.apiFetch.mock.calls[1];
    expect(call?.[0]).toBe(v1.persons.ROUTES.avatar(person.id));
    expect(call?.[2].body.get("file")).toBe(file);
  });

  it("preserves a failed picture and blocks duplicate submissions while saving", async () => {
    const browser = userEvent.setup();
    let rejectUpload!: (error: Error) => void;
    mocks.apiFetch.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectUpload = reject;
        }),
    );
    renderEditForm();
    const file = new File(["png"], "portrait.png", { type: "image/png" });
    await browser.upload(screen.getByLabelText("Choose a picture"), file);
    await browser.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("button", { name: /Saving/ })).toBeDisabled();
    await browser.type(screen.getByLabelText("First name"), "{Enter}");
    expect(mocks.apiFetch).toHaveBeenCalledTimes(1);
    rejectUpload(new Error("storage unavailable"));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Could not update your picture",
      ),
    );
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Remove picture" }),
    ).toBeVisible();
    mocks.apiFetch.mockResolvedValueOnce({
      ...person,
      avatarAssetId: "picture-1",
    });
    await browser.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalled());
    expect(mocks.apiFetch.mock.calls[1]?.[2].body.get("file")).toBe(file);
  });

  it("retries only the picture when person fields have already saved", async () => {
    const browser = userEvent.setup();
    mocks.apiFetch
      .mockResolvedValueOnce({ ...person, firstName: "Grace" })
      .mockRejectedValueOnce(new Error("upload failed"))
      .mockResolvedValueOnce({ ...person, avatarAssetId: "picture-1" });
    renderEditForm();
    await browser.clear(screen.getByLabelText("First name"));
    await browser.type(screen.getByLabelText("First name"), "Grace");
    const file = new File(["png"], "portrait.png", { type: "image/png" });
    await browser.upload(screen.getByLabelText("Choose a picture"), file);
    await browser.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Could not update your picture",
      ),
    );
    expect(screen.getByLabelText("First name")).toHaveValue("Grace");
    expect(mocks.push).not.toHaveBeenCalled();
    await browser.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalled());
    expect(mocks.apiFetch.mock.calls.map((call) => call[0])).toEqual([
      v1.persons.ROUTES.update(person.id),
      v1.persons.ROUTES.avatar(person.id),
      v1.persons.ROUTES.avatar(person.id),
    ]);
  });

  it("hides the submit action when field or picture edits are reverted", async () => {
    const browser = userEvent.setup();
    renderEditForm();
    const firstName = screen.getByLabelText("First name");
    await browser.clear(firstName);
    await browser.type(firstName, "Grace");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeVisible();
    await browser.clear(firstName);
    await browser.type(firstName, "Ada");
    expect(
      screen.queryByRole("button", { name: "Save changes" }),
    ).not.toBeInTheDocument();
    await browser.upload(
      screen.getByLabelText("Choose a picture"),
      new File(["png"], "portrait.png", { type: "image/png" }),
    );
    await browser.click(screen.getByRole("button", { name: "Remove picture" }));
    expect(
      screen.queryByRole("button", { name: "Save changes" }),
    ).not.toBeInTheDocument();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("stages removal of an existing picture until the person form is submitted", async () => {
    const browser = userEvent.setup();
    mocks.apiFetch.mockResolvedValue({ ...person, avatarAssetId: null });
    renderEditForm("en", { ...person, avatarAssetId: "existing-picture" });
    await browser.click(screen.getByRole("button", { name: "Remove picture" }));
    expect(mocks.apiFetch).not.toHaveBeenCalled();
    await browser.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledOnce());
    expect(mocks.apiFetch).toHaveBeenCalledWith(
      v1.persons.ROUTES.avatar(person.id),
      v1.persons.personSchema,
      { method: "DELETE" },
    );
  });

  it("prefills contact fields including the split phone input", () => {
    renderEditForm();

    expect(screen.getByLabelText("CNP")).toHaveValue("1900228123450");
    expect(screen.getByLabelText("First name")).toHaveValue("Ada");
    expect(screen.getByLabelText("Phone country")).toHaveValue("RO");
    expect(screen.getByLabelText("Phone")).toHaveValue("712 345 678");
    expect(screen.getByLabelText("Phone")).toHaveAttribute(
      "placeholder",
      "Phone number",
    );
  });

  it("updates the person and returns to the detail page", async () => {
    mocks.apiFetch.mockResolvedValueOnce({ ...person, firstName: "Grace" });
    const browser = userEvent.setup();

    renderEditForm();
    await browser.clear(screen.getByLabelText("First name"));
    await browser.type(screen.getByLabelText("First name"), "Grace");
    await browser.clear(screen.getByLabelText("Phone"));
    await browser.type(screen.getByLabelText("Phone"), "700111222");
    await browser.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.persons.ROUTES.update(person.id),
        v1.persons.personSchema,
        expect.objectContaining({
          method: "PATCH",
          json: expect.objectContaining({
            firstName: "Grace",
            phone: "+40700111222",
          }),
        }),
      ),
    );
    expect(mocks.push).toHaveBeenCalledWith("/en/persons/person-1");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("validates and saves a corrected person CNP without changing documents", async () => {
    const browser = userEvent.setup();
    mocks.apiFetch.mockResolvedValueOnce(person);
    renderEditForm();
    const cnp = screen.getByLabelText("CNP");
    await browser.clear(cnp);
    await browser.type(cnp, "123");
    await browser.click(screen.getByRole("button", { name: "Save changes" }));
    expect(mocks.apiFetch).not.toHaveBeenCalled();
    expect(cnp).toHaveAttribute("aria-invalid", "true");

    await browser.clear(cnp);
    await browser.type(cnp, "1900228123469");
    await browser.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledOnce());
    const payload = mocks.apiFetch.mock.calls[0]?.[2].json;
    expect(payload.cnp).toBe("1900228123469");
    expect(payload).not.toHaveProperty("documents");
  });

  it("validates a field when it loses focus, not before", async () => {
    const browser = userEvent.setup();
    renderEditForm();

    const firstName = screen.getByLabelText("First name");
    await browser.clear(firstName);

    // Still focused: the field has been emptied but not yet reported.
    expect(firstName).not.toHaveAttribute("aria-invalid");

    await browser.tab();

    await waitFor(() =>
      expect(firstName).toHaveAttribute("aria-invalid", "true"),
    );
    expect(firstName).toHaveAccessibleDescription("First name is required.");
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("clears the error as the field is retyped, without waiting for blur", async () => {
    const browser = userEvent.setup();
    renderEditForm();

    const email = screen.getByLabelText("Email");
    await browser.clear(email);
    await browser.tab();

    await waitFor(() => expect(email).toHaveAttribute("aria-invalid", "true"));

    await browser.type(email, "grace@example.com");

    await waitFor(() => expect(email).not.toHaveAttribute("aria-invalid"));
  });

  it("leaves untouched fields silent until submit", async () => {
    const browser = userEvent.setup();
    renderEditForm();

    // Editing one field must not flag the others.
    await browser.type(screen.getByLabelText("Locality"), "Cluj");
    await browser.tab();

    expect(screen.getByLabelText("First name")).not.toHaveAttribute(
      "aria-invalid",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("summarizes how many fields need attention on submit", async () => {
    const browser = userEvent.setup();
    renderEditForm();

    await browser.clear(screen.getByLabelText("First name"));
    await browser.clear(screen.getByLabelText("Last name"));
    await browser.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText("2 fields need attention."),
    ).toBeInTheDocument();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it.each([
    {
      locale: "en" as const,
      label: "Date of birth",
      message: "Date of birth cannot be in the future.",
    },
    {
      locale: "ro" as const,
      label: "Data nașterii",
      message: "Data nașterii nu poate fi în viitor.",
    },
  ])(
    "rejects a $locale date of birth in the future",
    async ({ label, locale, message }) => {
      const browser = userEvent.setup();
      renderEditForm(locale);

      const [day, month, year] = screen.getAllByLabelText(
        new RegExp(`^${label}`),
      );

      for (const [input, value] of [
        [day, "01"],
        [month, "01"],
        [year, "2999"],
      ] as const) {
        await browser.clear(input!);
        await browser.type(input!, value);
      }
      // Year -> calendar button is still inside the field, so a second tab is
      // needed to actually leave it.
      await browser.tab();
      await browser.tab();

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(mocks.apiFetch).not.toHaveBeenCalled();
    },
  );

  it("stops the date-of-birth calendar at the current UTC day", async () => {
    const browser = userEvent.setup();
    // Date-only validation follows the API's UTC day, even after local midnight.
    const todayIso = v1.common.dateOnlyToday();

    // Opens the calendar on the current month, so no wheel navigation is
    // needed to reach the boundary.
    renderEditForm("en", { ...person, dateOfBirth: todayIso });

    await browser.click(screen.getByRole("button", { name: "Open calendar" }));
    const dialog = await screen.findByRole("dialog");

    const todayLabel = new Intl.DateTimeFormat("en", {
      day: "numeric",
      month: "long",
      timeZone: "UTC",
      year: "numeric",
    }).format(new Date(`${todayIso}T00:00:00.000Z`));

    expect(
      within(dialog).getByRole("button", { name: todayLabel }),
    ).toBeEnabled();
    // Everything past today is out of bounds, so the month cannot advance.
    expect(
      within(dialog).getByRole("button", { name: "Next month" }),
    ).toBeDisabled();
  });
});

function renderEditForm(
  locale: SupportedLocale = "en",
  editedPerson: v1.persons.Person = person,
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <PageHeaderNavigationContext.Provider value={mocks.registerNavigation}>
        <PersonEditForm
          person={editedPerson}
          personHref="/en/persons/person-1"
        />
      </PageHeaderNavigationContext.Provider>
    </NextIntlClientProvider>,
  );
}
