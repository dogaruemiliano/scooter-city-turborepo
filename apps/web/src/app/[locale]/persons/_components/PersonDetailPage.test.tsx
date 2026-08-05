import { v1 } from "@repo/api-shared";
import { messages, type SupportedLocale } from "@repo/i18n";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PersonDetailPage } from "./PersonDetailPage";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
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
    replace: mocks.replace,
  }),
}));

const identityDocument: v1.persons.PersonDocument = {
  id: "document-1",
  personId: "person-1",
  type: "nationalId",
  series: "RR",
  number: "123456",
  cnp: "1900228123450",
  issuingCountryCode: "RO",
  issuedBy: "SPCLEP Bucuresti",
  issuedOn: "2024-01-15",
  expiresOn: "2030-01-31",
  status: "verified",
  notes: "Identity checked at pickup.",
  createdAt: "2026-06-25T10:00:00.000Z",
  updatedAt: "2026-06-25T10:00:00.000Z",
  deletedAt: null,
};

const driverLicenseDocument: v1.persons.PersonDocument = {
  ...identityDocument,
  id: "document-2",
  type: "driverLicense",
  series: "DL",
  number: "654321",
  cnp: null,
  notes: null,
};

const readyPerson: v1.persons.Person = {
  id: "person-1",
  email: "ada@example.com",
  phone: "+40712345678",
  firstName: "Ada",
  lastName: "Lovelace",
  dateOfBirth: "1990-02-28",
  addressLine1: "1 Computation Way",
  addressLine2: null,
  city: "Bucharest",
  region: "București",
  postalCode: "010101",
  countryCode: "RO",
  documents: [identityDocument, driverLicenseDocument],
  notes: "Frequent renter",
  createdAt: "2026-06-25T10:00:00.000Z",
  updatedAt: "2026-06-25T11:00:00.000Z",
  deletedAt: null,
};

const auditEvents: v1.persons.PersonAuditEvent[] = [
  {
    id: "audit-1",
    type: "PERSON_UPDATED",
    personId: "person-1",
    actor: {
      kind: "user",
      userId: "user-1",
      email: "admin@example.com",
      name: null,
    },
    document: null,
    replacement: null,
    changes: [
      {
        field: "phone",
        oldValue: "+40700000000",
        newValue: "+40712345678",
      },
    ],
    createdAt: "2026-06-25T12:00:00.000Z",
  },
];

const identityFrontPhoto: v1.persons.PersonDocumentPhoto = {
  id: "photo-1",
  personDocumentId: identityDocument.id,
  slot: "front",
  assetId: "asset-1",
  contentType: "image/jpeg",
  byteSize: 1234,
  checksumSha256:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  contentUrl: v1.persons.ROUTES.documents.photos.content(
    readyPerson.id,
    identityDocument.id,
    "front",
  ),
  createdAt: "2026-06-25T12:30:00.000Z",
  deletedAt: null,
};

const documentPhotos = {
  [identityDocument.id]: [identityFrontPhoto],
  [driverLicenseDocument.id]: [],
} satisfies Record<string, v1.persons.PersonDocumentPhoto[]>;

beforeEach(() => {
  mocks.apiFetch.mockReset();
  mocks.refresh.mockReset();
  mocks.replace.mockReset();

  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: MouseEvent,
  });
});

describe("PersonDetailPage", () => {
  it("renders compact document cards and opens the complete details", async () => {
    const browser = userEvent.setup();

    renderDetail();

    expect(
      screen.getByRole("link", { name: "Back to persons" }),
    ).toHaveAttribute("href", "/en/persons");
    expect(
      screen.getByRole("heading", { name: "Ada Lovelace" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Registered since Jun 25, 2026"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
    expect(screen.queryByText("Ready")).not.toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByText("+40712345678")).toBeInTheDocument();
    expect(screen.getByText("Frequent renter")).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Rental readiness" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Romania").length).toBeGreaterThan(0);
    expect(screen.queryByText("RO")).not.toBeInTheDocument();
    expect(
      screen.getByText("Country", { selector: "dt" }).parentElement
        ?.parentElement,
    ).toBe(
      screen.getByText("Region", { selector: "dt" }).parentElement
        ?.parentElement,
    );
    expect(
      screen.getByText("City", { selector: "dt" }).parentElement?.parentElement,
    ).toBe(
      screen.getByText("Postal code", { selector: "dt" }).parentElement
        ?.parentElement,
    );
    const identityCardTrigger = screen.getByRole("button", {
      name: "View National ID",
    });
    const identityCard =
      identityCardTrigger.querySelector('[data-slot="card"]');
    expect(identityCard).not.toBeNull();
    expect(
      within(identityCard as HTMLElement)
        .getByText("National ID")
        .closest('[data-slot="card-title"]'),
    ).toHaveTextContent(/National ID\s*Verified/);
    expect(
      within(identityCard as HTMLElement).getByLabelText(
        "Expires on Jan 31, 2030",
      ),
    ).toHaveTextContent(/Exp\.\s*Jan 31, 2030/);
    expect(screen.getByText("Driver license")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", {
        name: /View (National ID|Driver license)/,
      }),
    ).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "Edit document" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: "Front document photo" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("RR")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Call" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "WhatsApp" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Contact" })).toBeInTheDocument();
    const moreActionsButton = screen.getByRole("button", {
      name: "More actions",
    });
    expect(moreActionsButton).toBeInTheDocument();
    expect(moreActionsButton).toHaveTextContent("");
    expect(moreActionsButton).not.toHaveClass("border-border");
    expect(moreActionsButton.querySelector("svg")).toHaveClass(
      "lucide-ellipsis-vertical",
    );
    expect(moreActionsButton.parentElement).toContainElement(
      screen.getByRole("heading", { name: "Ada Lovelace" }),
    );
    expect(
      screen.getByRole("heading", { name: "Activity" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Person updated")).toBeInTheDocument();
    expect(screen.queryByText("admin@example.com")).not.toBeInTheDocument();

    await browser.click(
      screen.getByRole("button", { name: "View National ID" }),
    );
    const documentSheet = await screen.findByRole("dialog");

    expect(
      within(documentSheet).getByRole("heading", {
        name: "National ID, Verified",
      }),
    ).toContainElement(within(documentSheet).getByText("Verified"));
    expect(within(documentSheet).getAllByText("Verified")).toHaveLength(1);
    expect(
      within(documentSheet).queryByText(
        "Sensitive document identifiers are masked.",
      ),
    ).not.toBeInTheDocument();
    expect(
      within(documentSheet).getByRole("img", {
        name: "Front document photo",
      }),
    ).toHaveAttribute(
      "src",
      `https://api.test${identityFrontPhoto.contentUrl}`,
    );
    expect(within(documentSheet).getByText("RR")).toBeInTheDocument();
    expect(within(documentSheet).getByText("****3456")).toBeInTheDocument();
    expect(
      within(documentSheet).getByText("*********3450"),
    ).toBeInTheDocument();
    expect(screen.queryByText("123456")).not.toBeInTheDocument();
    expect(screen.queryByText("1900228123450")).not.toBeInTheDocument();
    expect(
      within(documentSheet).getByRole("button", { name: "Edit document" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete document" }),
    ).not.toBeInTheDocument();
  });

  it("expands and collapses activity details from the card footer", async () => {
    const browser = userEvent.setup();

    renderDetail();

    const toggle = screen.getByRole("button", {
      name: "Toggle details for Person updated",
    });
    const activityCard = toggle.closest('[data-slot="card"]');

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveClass("size-8", "border-transparent");
    expect(toggle).not.toHaveClass("border-t", "border-border");
    expect(toggle.querySelector(".lucide-chevron-down")).toHaveClass(
      "group-aria-expanded/accordion-trigger:hidden",
    );
    expect(toggle.querySelector(".lucide-chevron-up")).toHaveClass(
      "group-aria-expanded/accordion-trigger:inline",
    );
    expect(
      within(activityCard as HTMLElement).queryByText("admin@example.com"),
    ).not.toBeInTheDocument();
    expect(
      activityCard?.querySelector('[data-audit-event-icon="PERSON_UPDATED"]'),
    ).toHaveClass("lucide-user-round-pen");

    await browser.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(
      within(activityCard as HTMLElement).getByText("admin@example.com"),
    ).toBeVisible();

    await browser.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      within(activityCard as HTMLElement).queryByText("admin@example.com"),
    ).not.toBeInTheDocument();
  });

  it("moves secondary person actions into the more menu", async () => {
    const browser = userEvent.setup();

    renderDetail();
    expect(
      screen.queryByRole("button", { name: "Edit person" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add document" }),
    ).not.toBeInTheDocument();

    await browser.click(screen.getByRole("button", { name: "More actions" }));
    const menu = await screen.findByRole("menu");

    expect(within(menu).getByText("Edit person")).toBeInTheDocument();
    expect(within(menu).queryByText("Add document")).not.toBeInTheDocument();
    expect(
      within(menu).queryByRole("menuitem", { name: "Email" }),
    ).not.toBeInTheDocument();
    expect(within(menu).getByText("Delete person")).toBeInTheDocument();
  });

  it("groups all contact methods in a compact contact sheet", async () => {
    const browser = userEvent.setup();

    renderDetail();
    await browser.click(screen.getByRole("button", { name: "Contact" }));

    const contactSheet = await screen.findByRole("dialog");
    expect(
      within(contactSheet).getByRole("heading", {
        name: "Contact Ada Lovelace",
      }),
    ).toBeInTheDocument();

    const callLink = within(contactSheet).getByRole("link", {
      name: "Call Ada Lovelace",
    });
    const whatsappLink = within(contactSheet).getByRole("link", {
      name: "Message Ada Lovelace on WhatsApp",
    });
    const emailLink = within(contactSheet).getByRole("link", {
      name: "Email Ada Lovelace",
    });

    expect(callLink).toHaveAttribute("href", "tel:+40712345678");
    expect(whatsappLink).toHaveAttribute("href", "https://wa.me/40712345678");
    expect(emailLink).toHaveAttribute("href", "mailto:ada@example.com");
    expect(
      contactSheet.querySelector('[data-slot="bottom-sheet-body"]'),
    ).toHaveClass("pb-[max(var(--spacing-4),env(safe-area-inset-bottom))]");
    expect(callLink.parentElement).toBe(whatsappLink.parentElement);
    expect(callLink.parentElement).toBe(emailLink.parentElement);
    expect(callLink.parentElement).toHaveClass("grid-cols-3");
    expect(callLink.querySelector("svg")).toHaveClass("size-8");
    const whatsappIcon = whatsappLink.querySelector(
      '[data-contact-icon="whatsapp"]',
    );
    expect(whatsappIcon).toHaveClass("size-8", "bg-foreground");
    expect(whatsappIcon?.className).toContain("/icons/whatsapp-icon.svg");
    expect(emailLink.querySelector("svg")).toHaveClass("size-8");
  });

  it("opens the missing document slot as the correctly typed add sheet", () => {
    renderDetail({
      ...readyPerson,
      documents: [identityDocument],
    });

    expect(
      screen.getByRole("button", { name: "View National ID" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add Identity document" }),
    ).not.toBeInTheDocument();

    const emptyDriverSlot = screen.getByRole("button", {
      name: "Add Driver license",
    });
    expect(emptyDriverSlot.querySelector(".lucide-plus")).toHaveClass("size-6");
    expect(
      emptyDriverSlot.querySelector(".lucide-chevron-right"),
    ).not.toBeInTheDocument();

    fireEvent.click(emptyDriverSlot);

    expect(
      document.querySelector('[data-slot="bottom-sheet-popup"]'),
    ).toHaveAttribute("data-starting-style");
    const driverLicenseSheet = within(screen.getByRole("dialog"));
    expect(driverLicenseSheet.queryByLabelText("Document type")).toBeNull();
    expect(driverLicenseSheet.queryByLabelText("Series")).toBeNull();
    expect(driverLicenseSheet.queryByLabelText("CNP")).toBeNull();
    expect(driverLicenseSheet.getByLabelText("Number")).toBeInTheDocument();
  });

  it("shows only the number identifier for an existing driving licence", async () => {
    const browser = userEvent.setup();

    renderDetail();
    await browser.click(
      screen.getByRole("button", { name: "View Driver license" }),
    );
    const driverLicenseSheet = within(await screen.findByRole("dialog"));

    expect(
      driverLicenseSheet.queryByText("Series", { selector: "dt" }),
    ).toBeNull();
    expect(
      driverLicenseSheet.queryByText("CNP", { selector: "dt" }),
    ).toBeNull();
    expect(
      driverLicenseSheet.getByText("Document number", { selector: "dt" }),
    ).toBeInTheDocument();
  });

  it("updates the person from the edit dialog", async () => {
    mocks.apiFetch.mockResolvedValueOnce({
      ...readyPerson,
      firstName: "Grace",
    });
    const browser = userEvent.setup();

    renderDetail();
    await browser.click(screen.getByRole("button", { name: "More actions" }));
    await browser.click(await screen.findByText("Edit person"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Phone country")).toHaveValue("RO");
    expect(within(dialog).getByLabelText("Phone")).toHaveValue("712345678");
    expect(within(dialog).getByLabelText("Phone")).toHaveAttribute(
      "placeholder",
      "Phone number",
    );
    await browser.clear(within(dialog).getByLabelText("First name"));
    await browser.type(within(dialog).getByLabelText("First name"), "Grace");
    await browser.clear(within(dialog).getByLabelText("Phone"));
    await browser.type(within(dialog).getByLabelText("Phone"), "700111222");
    await browser.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.persons.ROUTES.update(readyPerson.id),
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
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("requires an expiration date or saves an explicit no-expiry value", async () => {
    const browser = userEvent.setup();

    renderDetail();
    await browser.click(
      screen.getByRole("button", { name: "View National ID" }),
    );
    const detailSheet = await screen.findByRole("dialog");
    await browser.click(
      within(detailSheet).getByRole("button", { name: "Edit document" }),
    );
    await waitFor(() =>
      expect(
        document.querySelectorAll('[data-slot="bottom-sheet-popup"]'),
      ).toHaveLength(2),
    );
    const sheets = document.querySelectorAll(
      '[data-slot="bottom-sheet-popup"]',
    );
    const editSheet = sheets[1] as HTMLElement;
    const expirySwitch = within(editSheet).getByRole("switch", {
      name: "Document has expiry date?",
    });
    const expiryDay = within(editSheet).getByLabelText("Expires on");
    const saveButton = within(editSheet).getByRole("button", { name: "Save" });

    expect(expirySwitch).toBeChecked();
    expect(saveButton).toBeDisabled();
    expect(expiryDay).toHaveAttribute("aria-required", "true");
    expect(within(editSheet).getByLabelText("Expires on MM")).toHaveAttribute(
      "aria-required",
      "true",
    );
    expect(within(editSheet).getByLabelText("Expires on YYYY")).toHaveAttribute(
      "aria-required",
      "true",
    );

    await browser.clear(expiryDay);
    expect(saveButton).toBeEnabled();
    await browser.click(saveButton);
    expect(
      within(editSheet).getByText("Expires on is required."),
    ).toBeInTheDocument();
    expect(mocks.apiFetch).not.toHaveBeenCalled();

    await browser.click(expirySwitch);
    expect(expirySwitch).not.toBeChecked();
    expect(within(editSheet).queryByText("No expiration date")).toBeNull();
    expect(within(editSheet).getByLabelText("Expires on")).toBeDisabled();
    expect(within(editSheet).getByLabelText("Expires on MM")).toBeDisabled();
    expect(within(editSheet).getByLabelText("Expires on YYYY")).toBeDisabled();

    mocks.apiFetch.mockResolvedValueOnce({
      ...identityDocument,
      expiresOn: null,
    });
    await browser.click(
      within(editSheet).getByRole("button", { name: "Save" }),
    );

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.persons.ROUTES.documents.update(readyPerson.id, identityDocument.id),
        v1.persons.personDocumentSchema,
        expect.objectContaining({
          method: "PATCH",
          json: expect.objectContaining({ expiresOn: null }),
        }),
      ),
    );
    const savedButton = await within(editSheet).findByRole("button", {
      name: "Saved",
    });
    expect(savedButton).toHaveAttribute("data-state", "success");
    expect(savedButton).toHaveClass("bg-success", "text-success-foreground");
    expect(screen.queryByText("Document saved")).not.toBeInTheDocument();
  });

  it("soft-deletes documents and the person with confirmation", async () => {
    mocks.apiFetch.mockResolvedValue(undefined);
    const browser = userEvent.setup();

    renderDetail();
    await browser.click(
      screen.getByRole("button", { name: "View National ID" }),
    );
    let sheets = document.querySelectorAll('[data-slot="bottom-sheet-popup"]');
    expect(sheets).toHaveLength(1);
    await browser.click(
      within(sheets[0] as HTMLElement).getByRole("button", {
        name: "Edit document",
      }),
    );
    await waitFor(() =>
      expect(
        document.querySelectorAll('[data-slot="bottom-sheet-popup"]'),
      ).toHaveLength(2),
    );
    sheets = document.querySelectorAll('[data-slot="bottom-sheet-popup"]');
    const editSheet = sheets[1] as HTMLElement;
    const deleteDocumentButton = within(editSheet).getByRole("button", {
      name: "Delete document",
    });
    expect(
      deleteDocumentButton.closest('[data-slot="bottom-sheet-body"]'),
    ).toBe(editSheet.querySelector('[data-slot="bottom-sheet-body"]'));
    expect(
      within(
        editSheet.querySelector(
          '[data-slot="bottom-sheet-footer"]',
        ) as HTMLElement,
      ).queryByRole("button", { name: "Delete document" }),
    ).not.toBeInTheDocument();
    await browser.click(deleteDocumentButton);
    await waitFor(() =>
      expect(
        document.querySelectorAll('[data-slot="bottom-sheet-popup"]'),
      ).toHaveLength(3),
    );
    sheets = document.querySelectorAll('[data-slot="bottom-sheet-popup"]');
    expect(sheets[0]).toHaveAttribute("data-nested-drawer-open");
    expect(sheets[1]).toHaveAttribute("data-nested-drawer-open");
    await browser.click(
      within(sheets[2] as HTMLElement).getByRole("button", {
        name: "Delete document",
      }),
    );

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.persons.ROUTES.documents.delete(readyPerson.id, identityDocument.id),
        v1.common.noContentSchema,
        { method: "DELETE" },
      ),
    );
    await waitFor(() =>
      expect(
        document.querySelectorAll('[data-slot="bottom-sheet-popup"]'),
      ).toHaveLength(1),
    );
    const remainingSheet = document.querySelector(
      '[data-slot="bottom-sheet-popup"]',
    );
    await browser.click(
      within(remainingSheet as HTMLElement).getByRole("button", {
        name: "Close",
      }),
    );
    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="bottom-sheet-popup"]'),
      ).not.toBeInTheDocument(),
    );

    await browser.click(screen.getByRole("button", { name: "More actions" }));
    await browser.click(await screen.findByText("Delete person"));
    const dialog = await screen.findByRole("dialog");
    await browser.click(
      within(dialog).getByRole("button", { name: "Delete person" }),
    );

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.persons.ROUTES.delete(readyPerson.id),
        v1.common.noContentSchema,
        { method: "DELETE" },
      ),
    );
    expect(mocks.replace).toHaveBeenCalledWith("/en/persons");
  });

  it("uploads and deletes document photos through the API", async () => {
    const backPhoto: v1.persons.PersonDocumentPhoto = {
      ...identityFrontPhoto,
      id: "photo-2",
      slot: "back",
      contentType: "image/png",
      contentUrl: v1.persons.ROUTES.documents.photos.content(
        readyPerson.id,
        identityDocument.id,
        "back",
      ),
    };
    mocks.apiFetch
      .mockResolvedValueOnce(backPhoto)
      .mockResolvedValueOnce(undefined);
    const browser = userEvent.setup();

    renderDetail();
    await browser.click(
      screen.getByRole("button", { name: "View National ID" }),
    );
    await browser.upload(
      screen.getByLabelText("Back photo upload"),
      new File(["back-image"], "back.png", { type: "image/png" }),
    );

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.persons.ROUTES.documents.photos.upsert(
          readyPerson.id,
          identityDocument.id,
          "back",
        ),
        v1.persons.personDocumentPhotoSchema,
        expect.objectContaining({
          method: "PUT",
          body: expect.any(FormData),
        }),
      ),
    );
    expect(
      screen.getByRole("img", { name: "Back document photo" }),
    ).toHaveAttribute("src", `https://api.test${backPhoto.contentUrl}`);

    await browser.click(
      screen.getAllByRole("button", { name: "Delete photo" })[0],
    );
    const deletePhotoConfirmation = await screen.findByRole("alertdialog", {
      name: "Are you sure?",
    });
    expect(screen.queryByRole("heading", { name: "Delete photo?" })).toBeNull();
    await browser.click(
      within(deletePhotoConfirmation).getByRole("button", { name: "Cancel" }),
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mocks.apiFetch).toHaveBeenCalledTimes(1);

    await browser.click(
      screen.getAllByRole("button", { name: "Delete photo" })[0],
    );
    await browser.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Delete permanently",
      }),
    );

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.persons.ROUTES.documents.photos.delete(
          readyPerson.id,
          identityDocument.id,
          "front",
        ),
        v1.common.noContentSchema,
        { method: "DELETE" },
      ),
    );
    expect(
      screen.queryByText("The document photo has been deleted."),
    ).not.toBeInTheDocument();
  });

  it("keeps a failed document photo upload local and offers retry", async () => {
    const backPhoto: v1.persons.PersonDocumentPhoto = {
      ...identityFrontPhoto,
      id: "photo-retried",
      slot: "back",
      contentType: "image/png",
      contentUrl: v1.persons.ROUTES.documents.photos.content(
        readyPerson.id,
        identityDocument.id,
        "back",
      ),
    };
    mocks.apiFetch
      .mockRejectedValueOnce(new Error("Upload failed"))
      .mockResolvedValueOnce(backPhoto);
    const browser = userEvent.setup();
    const file = new File(["back-image"], "back.png", { type: "image/png" });

    renderDetail();
    await browser.click(
      screen.getByRole("button", { name: "View National ID" }),
    );
    expect(screen.queryByText("Document photos")).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Delete photo" }),
    ).toHaveLength(1);

    await browser.upload(screen.getByLabelText("Back photo upload"), file);

    const retry = await screen.findByRole("button", { name: "Try again" });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Upload failed: back.png",
    );
    expect(
      screen.getAllByRole("button", { name: "Delete photo" }),
    ).toHaveLength(1);

    await browser.click(retry);

    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledTimes(2));
    expect(
      screen.getByRole("img", { name: "Back document photo" }),
    ).toHaveAttribute("src", `https://api.test${backPhoto.contentUrl}`);
    expect(
      screen.queryByRole("button", { name: "Try again" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Delete photo" }),
    ).toHaveLength(2);
  });

  it("renders deleted and empty document states", () => {
    renderDetail({
      ...readyPerson,
      documents: [],
      notes: null,
      deletedAt: "2026-06-26T10:00:00.000Z",
    });

    expect(screen.getAllByText("Deleted").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Add Identity document" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add Driver license" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Not added")).toHaveLength(2);
    expect(screen.getByText("Missing identity document.")).toBeInTheDocument();
    expect(screen.getByText("Missing driver license.")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it.each([
    {
      name: "missing required document",
      documents: [identityDocument],
      expected: "Missing driver license.",
    },
    {
      name: "expired document",
      documents: [
        { ...identityDocument, expiresOn: "2020-01-01" },
        driverLicenseDocument,
      ],
      expected: "A document is expired.",
    },
    {
      name: "rejected document",
      documents: [
        { ...identityDocument, status: "rejected" as const },
        driverLicenseDocument,
      ],
      expected: "A document was rejected.",
    },
    {
      name: "unverified document",
      documents: [
        { ...identityDocument, status: "unverified" as const },
        driverLicenseDocument,
      ],
      expected: "A document is waiting for verification.",
    },
  ])("renders readiness issue for $name", ({ documents, expected }) => {
    renderDetail({ ...readyPerson, documents });

    expect(screen.queryByText("Needs review")).not.toBeInTheDocument();
    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Rental readiness" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Rental readiness" }),
    ).toContainElement(screen.getByRole("alert"));
  });

  it("renders Romanian detail copy with diacritics", async () => {
    const browser = userEvent.setup();

    renderDetail(readyPerson, "ro");

    expect(
      screen.getByRole("link", { name: "Înapoi la persoane" }),
    ).toHaveAttribute("href", "/persons");
    expect(
      screen.getByText("Înregistrat din 25 iun. 2026"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Pregătită")).not.toBeInTheDocument();
    expect(screen.getByText("Carte de identitate")).toBeInTheDocument();
    expect(screen.getAllByText("România").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Contactează" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Vezi Carte de identitate" }),
    ).toBeInTheDocument();

    await browser.click(
      screen.getByRole("button", { name: "Vezi Carte de identitate" }),
    );
    await browser.click(
      screen.getAllByRole("button", { name: "Șterge poza" })[0],
    );
    const confirmation = screen.getByRole("alertdialog", {
      name: "Ești sigur?",
    });
    expect(confirmation).toHaveTextContent("Ești sigur?");
    expect(
      within(confirmation).getByRole("button", {
        name: "Șterge permanent",
      }),
    ).toBeInTheDocument();
  });
});

function renderDetail(
  person: v1.persons.Person = readyPerson,
  locale: SupportedLocale = "en",
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <PersonDetailPage
        person={person}
        auditEvents={auditEvents}
        documentPhotos={documentPhotos}
        personsHref={locale === "en" ? "/en/persons" : "/persons"}
      />
    </NextIntlClientProvider>,
  );
}
