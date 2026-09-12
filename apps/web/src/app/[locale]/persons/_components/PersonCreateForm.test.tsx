import { ApiError, v1 } from "@repo/api-shared";
import { messages, type SupportedLocale } from "@repo/i18n";
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
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PersonCreateForm } from "./PersonCreateForm";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  createPerson: vi.fn(),
  extractDocument: vi.fn(),
  s3Fetch: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  webApi: {
    fetch: mocks.apiFetch,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh,
  }),
}));

const createdPerson: v1.persons.Person = {
  id: "person-2",
  email: "rider@example.com",
  phone: "+40749096855",
  firstName: "Grace",
  lastName: "Hopper",
  dateOfBirth: "1990-02-28",
  addressLine1: "1 Rental Street",
  addressLine2: "Apt 4",
  city: "Bucharest",
  region: "București",
  postalCode: "010101",
  countryCode: "RO",
  documents: [
    {
      id: "document-1",
      personId: "person-2",
      type: "nationalId",
      series: "RX",
      number: "123456",
      cnp: "1900228123450",
      issuingCountryCode: "RO",
      issuedBy: "SPCLEP Bucuresti",
      issuedOn: "2024-01-15",
      expiresOn: "2030-01-31",
      status: "verified",
      notes: null,
      createdAt: "2026-06-25T10:00:00.000Z",
      updatedAt: "2026-06-25T10:00:00.000Z",
      deletedAt: null,
    },
  ],
  notes: "Frequent rider",
  createdAt: "2026-06-25T10:00:00.000Z",
  updatedAt: "2026-06-25T10:00:00.000Z",
  deletedAt: null,
};

beforeEach(() => {
  mocks.apiFetch.mockReset();
  mocks.createPerson.mockReset();
  mocks.createPerson.mockResolvedValue(createdPerson);
  mocks.extractDocument.mockReset();
  mocks.extractDocument.mockRejectedValue(
    new ApiError(503, "Disabled", "DOCUMENT_EXTRACTION_DISABLED"),
  );
  mocks.apiFetch.mockImplementation((route, ...args) =>
    route === v1.persons.ROUTES.documents.photos.createDraftUploadUrl
      ? Promise.resolve({
          uploadUrl: "https://s3.test/upload/front",
          uploadToken: "draft-front-token",
          method: "PUT",
          headers: { "Content-Type": "image/png" },
          expiresAt: "2026-06-25T10:05:00.000Z",
          maxBytes: 64,
        })
      : route === v1.persons.ROUTES.documents.extract
        ? mocks.extractDocument(route, ...args)
        : mocks.createPerson(route, ...args),
  );
  mocks.s3Fetch.mockReset();
  mocks.s3Fetch.mockResolvedValue(new Response(null, { status: 200 }));
  mocks.push.mockReset();
  mocks.refresh.mockReset();
  vi.stubGlobal("fetch", mocks.s3Fetch);

  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: MouseEvent,
  });
});

describe("PersonCreateForm wizard", () => {
  it("separates personal, contact, address and document review with step validation", async () => {
    const browser = userEvent.setup();
    await renderReviewForm(browser);
    expect(screen.getByLabelText("First name")).toBeVisible();
    expect(screen.getByLabelText("Last name")).toBeVisible();
    expect(screen.getByLabelText("CNP")).toBeVisible();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("County")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create person" }),
    ).not.toBeInTheDocument();

    await browser.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByLabelText("First name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    changeField("First name", "Grace");
    changeField("Last name", "Hopper");
    changeField("CNP", "1900228123450");
    await browser.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByLabelText("Email")).toBeVisible();
    expect(screen.queryByLabelText("First name")).not.toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByLabelText("Email")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    changeField("Email", "rider@example.com");
    changeField("Phone", "749096855");
    await browser.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("CNP")).toHaveValue("1900228123450");
    await browser.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByLabelText("Phone")).toHaveValue("749096855");
    await browser.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByLabelText("County")).toBeVisible();
    expect(screen.getByLabelText("Locality")).toBeVisible();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("button", { name: /^(Add|Edit) National ID$/ }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Create person" })).toBeVisible();
    expect(screen.queryByLabelText("CNP")).not.toBeInTheDocument();
    expect(mocks.createPerson).not.toHaveBeenCalled();
  });

  it("starts with citizenship cards before any uploads or personal fields", () => {
    renderCreateForm();
    expect(
      screen.getByRole("heading", { name: "Who are you adding?" }),
    ).toBeInTheDocument();
    const romanian = screen.getByRole("button", { name: "Romanian citizen" });
    expect(romanian.querySelector("img")).toHaveAttribute(
      "src",
      "/icons/flag-romania.svg",
    );
    expect(
      screen.getByRole("button", { name: "Foreign citizen" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Document photos" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("First name")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create person" }),
    ).not.toBeInTheDocument();
    expect(
      screen
        .getByRole("list", { name: "Add person progress" })
        .querySelector('[aria-current="step"]'),
    ).toHaveTextContent("Citizenship");
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("requires an explicit ID version choice for Romanian citizens", async () => {
    const browser = userEvent.setup();
    renderCreateForm();
    await browser.click(
      screen.getByRole("button", { name: "Romanian citizen" }),
    );
    expect(
      screen.getByRole("button", { name: "Old national ID" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", { name: "Electronic ID (CEI)" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.queryByRole("region", { name: "Document photos" }),
    ).not.toBeInTheDocument();
    await browser.click(
      screen.getByRole("button", { name: "Old national ID" }),
    );
    const nationalId = getPhotoGroup("National ID");
    expect(
      within(nationalId).getByRole("button", { name: "Add Front photo" }),
    ).toBeInTheDocument();
    expect(
      within(nationalId).queryByRole("button", { name: "Add Back photo" }),
    ).not.toBeInTheDocument();
    const licence = getPhotoGroup("Driver license Optional");
    expect(
      within(licence).getByRole("button", { name: "Add Front photo" }),
    ).toBeInTheDocument();
    expect(
      within(licence).getByRole("button", { name: "Add Back photo" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("First name")).not.toBeInTheDocument();
  });

  it("skips ID version selection for foreign citizens and leaves extra documents optional", async () => {
    const browser = userEvent.setup();
    renderCreateForm();
    await enterDocuments(browser, "foreign");
    expect(
      screen.queryByRole("button", { name: "Old national ID" }),
    ).not.toBeInTheDocument();
    expect(getPhotoGroup("Passport")).toBeInTheDocument();
    expect(getPhotoGroup("Visa Optional")).toBeInTheDocument();
    expect(getPhotoGroup("Residence permit Optional")).toBeInTheDocument();
    expect(getPhotoGroup("Driver license Optional")).toBeInTheDocument();
    await uploadPhoto(browser, "Passport");
    await browser.click(screen.getByRole("button", { name: "Review details" }));
    fillRequiredFields();
    await submitPerson(browser);
    await waitFor(() => expect(mocks.createPerson).toHaveBeenCalledOnce());
    expect(mocks.createPerson).toHaveBeenCalledWith(
      v1.persons.ROUTES.create,
      v1.persons.personSchema,
      {
        method: "POST",
        json: expect.objectContaining({
          documentWorkflow: "foreign",
          documents: [
            expect.objectContaining({
              type: "passport",
              photos: { front: "draft-front-token" },
            }),
          ],
        }),
      },
    );
    expect(mocks.push).toHaveBeenCalledWith("/en/persons/person-2");
  });

  it("requires uploaded documents before opening the editable review form", async () => {
    const browser = userEvent.setup();
    renderCreateForm();
    await enterDocuments(browser);
    await browser.click(screen.getByRole("button", { name: "Review details" }));
    expect(
      await within(getPhotoGroup("National ID")).findByText(
        "Add the required files for National ID.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("First name")).not.toBeInTheDocument();
    expect(mocks.createPerson).not.toHaveBeenCalled();
    await uploadPhoto(browser, "National ID");
    await browser.click(screen.getByRole("button", { name: "Review details" }));
    expect(screen.getByLabelText("First name")).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Document photos" }),
    ).not.toBeInTheDocument();
    await submitPerson(browser);
    expect(await screen.findByText("Person not created")).toBeInTheDocument();
    showReviewStep("Personal details");
    expect(screen.getByLabelText("First name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    showReviewStep("Contact details");
    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription(
      "Email is required.",
    );
    expect(mocks.createPerson).not.toHaveBeenCalled();
  });

  it("preserves uploaded photos and entered phone, name and document details when going back", async () => {
    const browser = userEvent.setup();
    await renderReviewForm(browser);
    fillRequiredFields();
    await saveNationalIdDocument(browser);
    showReviewStep("Personal details");
    await browser.click(screen.getByRole("button", { name: "Back" }));
    expect(
      within(getPhotoGroup("National ID")).getByRole("button", {
        name: "Change Front photo",
      }),
    ).toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: "Review details" }));
    showReviewStep("Contact details");
    expect(screen.getByLabelText("Phone")).toHaveValue("749096855");
    showReviewStep("Personal details");
    expect(screen.getByLabelText("First name")).toHaveValue("Grace");
    const dialog = await openNationalIdSheet(browser);
    expect(within(dialog).queryByLabelText("CNP")).toBeNull();
    await browser.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(mocks.s3Fetch).toHaveBeenCalledOnce();
  });

  it("submits reviewed data and opens the newly created person's detail page", async () => {
    const browser = userEvent.setup();
    await renderReviewForm(browser);
    fillRequiredFields("0749096855");
    showReviewStep("Address");
    await selectAddressOption(browser, "County", "București");
    changeField("Address line 1", "1 Rental Street");
    changeField("Address line 2", "Apt 4");
    await selectAddressOption(browser, "Locality", "București");
    changeField("Postal code", "010101");
    changeField("Notes", "Frequent rider");
    changeField("CNP", "1900228123450");
    const dialog = await openNationalIdSheet(browser);
    changeDialogField(dialog, "Series", "rx");
    changeDialogField(dialog, "Number", "123456");
    changeDialogField(dialog, "Issued by", "SPCLEP Bucuresti");
    fillDialogDateParts(dialog, "Issued on", {
      day: "15",
      month: "01",
      year: "2024",
    });
    fillDialogDateParts(dialog, "Expires on", {
      day: "31",
      month: "01",
      year: "2030",
    });
    await saveDocumentSheet(browser, dialog);
    const summary = within(
      screen.getByRole("article", { name: "National ID" }),
    );
    expect(summary.getByText("RX")).toBeVisible();
    expect(summary.getByText("123456")).toBeVisible();
    expect(summary.getByText("Jan 15, 2024")).toBeVisible();
    expect(summary.getByText("Jan 31, 2030")).toBeVisible();
    await submitPerson(browser);
    await waitFor(() => expect(mocks.createPerson).toHaveBeenCalledOnce());
    expect(mocks.createPerson).toHaveBeenCalledWith(
      v1.persons.ROUTES.create,
      v1.persons.personSchema,
      {
        method: "POST",
        json: {
          documentWorkflow: "romanianClassic",
          cnp: "1900228123450",
          email: "rider@example.com",
          phone: "+40749096855",
          firstName: "Grace",
          lastName: "Hopper",
          dateOfBirth: "1990-02-28",
          addressLine1: "1 Rental Street",
          addressLine2: "Apt 4",
          city: "București",
          region: "București",
          postalCode: "010101",
          countryCode: "RO",
          notes: "Frequent rider",
          documents: [
            {
              type: "nationalId",
              nationalIdFormat: "classic",
              series: "RX",
              number: "123456",
              issuingCountryCode: "RO",
              issuedBy: "SPCLEP Bucuresti",
              issuedOn: "2024-01-15",
              expiresOn: "2030-01-31",
              status: "verified",
              photos: { front: "draft-front-token" },
            },
          ],
        },
      },
    );
    expect(mocks.push).toHaveBeenCalledWith("/en/persons/person-2");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("requires electronic ID front, back and proof of address, with a real PDF file preview", async () => {
    const browser = userEvent.setup();
    renderCreateForm();
    await enterDocuments(browser, "romanian", "electronic");
    await uploadPhoto(browser, "National ID");
    await browser.click(screen.getByRole("button", { name: "Review details" }));
    expect(
      within(getPhotoGroup("National ID")).getByText(
        "Add the required files for National ID.",
      ),
    ).toBeInTheDocument();
    expect(
      within(getPhotoGroup("Proof of address")).getByText(
        "Add the required files for Proof of address.",
      ),
    ).toBeInTheDocument();
    await uploadPhoto(browser, "National ID", "Back");
    await browser.click(
      within(getPhotoGroup("Proof of address")).getByRole("button", {
        name: "Add Proof of address file",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Proof of address file",
    });
    const fileInput = within(dialog).getByLabelText("Choose from files");
    expect(fileInput).toHaveAttribute(
      "accept",
      "image/jpeg,image/png,image/webp,application/pdf",
    );
    await browser.upload(
      fileInput,
      new File(["%PDF-proof"], "residence.pdf", { type: "application/pdf" }),
    );
    expect(within(dialog).getByText("residence.pdf")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("link", { name: "Open file" }),
    ).toHaveAttribute("href", expect.stringMatching(/^blob:/));
    expect(within(dialog).queryByRole("img")).not.toBeInTheDocument();
    await browser.click(
      within(dialog).getByRole("button", { name: "Use file" }),
    );
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(
      within(getPhotoGroup("Proof of address")).queryByRole("img"),
    ).not.toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: "Review details" }));
    expect(await screen.findByLabelText("First name")).toBeInTheDocument();
    fillRequiredFields();
    await saveNationalIdDocument(browser);
    const idSummary = within(
      screen.getByRole("article", { name: "National ID" }),
    );
    expect(idSummary.getByText("ID number")).toBeVisible();
    expect(idSummary.queryByText("Series")).not.toBeInTheDocument();
    const idEditor = await openNationalIdSheet(browser);
    expect(within(idEditor).getByLabelText("ID number")).toBeVisible();
    expect(within(idEditor).queryByLabelText("Series")).not.toBeInTheDocument();
    await browser.click(
      within(idEditor).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() => expect(idEditor).not.toBeInTheDocument());

    await submitPerson(browser);
    await waitFor(() => expect(mocks.createPerson).toHaveBeenCalledOnce());
    expect(mocks.apiFetch).toHaveBeenCalledWith(
      v1.persons.ROUTES.documents.photos.createDraftUploadUrl,
      v1.persons.personDocumentPhotoUploadUrlSchema,
      {
        method: "POST",
        json: expect.objectContaining({
          contentType: "application/pdf",
          documentType: "proofOfAddress",
        }),
      },
    );
    expect(mocks.createPerson).toHaveBeenCalledWith(
      v1.persons.ROUTES.create,
      v1.persons.personSchema,
      {
        method: "POST",
        json: expect.objectContaining({
          documentWorkflow: "romanianElectronic",
          documents: [
            expect.objectContaining({
              type: "nationalId",
              nationalIdFormat: "electronic",
              photos: { front: "draft-front-token", back: "draft-front-token" },
            }),
            expect.objectContaining({
              type: "proofOfAddress",
              expiresOn: null,
            }),
          ],
        }),
      },
    );
  });

  it("keeps document sheet cancellation reversible and the sheet surface distinct", async () => {
    const browser = userEvent.setup();
    await renderReviewForm(browser);
    let dialog = await openNationalIdSheet(browser);
    expect(dialog).toHaveClass("bg-popover", "text-popover-foreground");
    for (const surface of dialog.querySelectorAll(
      '[data-slot="bottom-sheet-header"], [data-slot="bottom-sheet-body"], [data-slot="bottom-sheet-footer"], [data-slot="bottom-sheet-body"] > div',
    ))
      expect(surface).not.toHaveClass("bg-background");
    changeDialogField(dialog, "Number", "123456");
    await browser.click(
      within(dialog).getByRole("switch", { name: "Document has expiry date?" }),
    );
    await saveDocumentSheet(browser, dialog);
    dialog = await openNationalIdSheet(browser);
    changeDialogField(dialog, "Number", "999999");
    await browser.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    dialog = await openNationalIdSheet(browser);
    expect(within(dialog).getByLabelText("Number")).toHaveValue("123456");
    expect(mocks.createPerson).not.toHaveBeenCalled();
  });

  it("keeps licence categories editable and unverified until explicitly reviewed", async () => {
    const browser = userEvent.setup();
    await renderReviewForm(browser);
    fillRequiredFields();
    await saveNationalIdDocument(browser);
    await browser.click(
      screen.getByRole("button", { name: "Add Driver license" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Add document" });
    expect(
      within(dialog).getByRole("combobox", { name: "Document status" }),
    ).toHaveTextContent("Unverified");
    await browser.click(
      within(dialog).getByRole("button", { name: "Add category" }),
    );
    await browser.selectOptions(
      within(dialog).getByLabelText("Category"),
      "A1",
    );
    fillDialogDateParts(dialog, "Category expires on (A1)", {
      day: "31",
      month: "12",
      year: "2030",
    });
    await browser.click(
      within(dialog).getByRole("switch", { name: "Document has expiry date?" }),
    );
    await saveDocumentSheet(browser, dialog);
    await submitPerson(browser);
    await waitFor(() => expect(mocks.createPerson).toHaveBeenCalledOnce());
    expect(mocks.createPerson).toHaveBeenCalledWith(
      v1.persons.ROUTES.create,
      v1.persons.personSchema,
      {
        method: "POST",
        json: expect.objectContaining({
          documents: [
            expect.objectContaining({ type: "nationalId" }),
            expect.objectContaining({
              type: "driverLicense",
              status: "unverified",
              licenseCategories: [
                expect.objectContaining({
                  category: "A1",
                  expiresOn: "2030-12-31",
                }),
              ],
            }),
          ],
        }),
      },
    );
  });

  it("keeps the chooser cancellable and blocks progression after a failed upload", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const browser = userEvent.setup();
    renderCreateForm();
    await enterDocuments(browser);
    await browser.click(
      within(getPhotoGroup("National ID")).getByRole("button", {
        name: "Add Front photo",
      }),
    );
    const chooser = await screen.findByRole("dialog", { name: "Front photo" });
    expect(
      within(chooser).getByLabelText("Choose from gallery"),
    ).toHaveAttribute("accept", "image/*");
    await browser.click(
      within(chooser).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() => expect(chooser).not.toBeInTheDocument());
    expect(mocks.apiFetch).not.toHaveBeenCalled();
    mocks.s3Fetch.mockResolvedValueOnce(new Response(null, { status: 500 }));
    await uploadPhoto(browser, "National ID");
    expect(await screen.findByText("Photos not uploaded")).toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: "Review details" }));
    expect(screen.queryByLabelText("First name")).not.toBeInTheDocument();
    await browser.click(
      within(getPhotoGroup("National ID")).getByRole("button", {
        name: "Try again",
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Review details" }),
      ).toBeEnabled(),
    );
    await browser.click(screen.getByRole("button", { name: "Review details" }));
    expect(screen.getByLabelText("First name")).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it("preserves uploads when moving back through citizenship and ID selection", async () => {
    const browser = userEvent.setup();
    renderCreateForm();
    await enterDocuments(browser);
    await uploadPhoto(browser, "National ID");
    await browser.click(screen.getByRole("button", { name: "Back" }));
    await browser.click(screen.getByRole("button", { name: "Back" }));
    await enterDocuments(browser, "foreign");
    expect(
      within(getPhotoGroup("Passport")).getByRole("button", {
        name: "Add Front photo",
      }),
    ).toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: "Back" }));
    await enterDocuments(browser);
    expect(
      within(getPhotoGroup("National ID")).getByRole("button", {
        name: "Change Front photo",
      }),
    ).toBeInTheDocument();
    expect(mocks.s3Fetch).toHaveBeenCalledOnce();
  });

  it("shows localized wizard and review validation", async () => {
    const browser = userEvent.setup();
    renderCreateForm("ro");
    expect(
      screen.getByRole("heading", { name: "Pe cine adaugi?" }),
    ).toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: "Cetățean român" }));
    await browser.click(
      screen.getByRole("button", { name: "Carte de identitate veche" }),
    );
    const photos = screen.getByRole("region", { name: "Fotografii documente" });
    const nationalId = within(photos).getByRole("group", {
      name: "Carte de identitate",
    });
    await browser.click(
      within(nationalId).getByRole("button", { name: "Adaugă poza: Față" }),
    );
    const chooser = await screen.findByRole("dialog", {
      name: "Poză document: Față",
    });
    await browser.upload(
      within(chooser).getByLabelText("Alege din fișiere"),
      new File(["photo"], "id.png", { type: "image/png" }),
    );
    await browser.click(
      within(chooser).getByRole("button", { name: "Folosește fotografia" }),
    );
    await waitFor(() => expect(chooser).not.toBeInTheDocument());
    await browser.click(
      screen.getByRole("button", { name: "Verifică datele" }),
    );
    changeField("Prenume", "Ana");
    changeField("Nume", "Ionescu");
    changeField("Email", "ana@example.com");
    changeField("Telefon", "123");
    showReviewStep("Date documente");
    await browser.click(
      screen.getByRole("button", { name: "Creează persoana" }),
    );
    expect(
      await screen.findByText("Persoana nu a fost creată"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Telefon")).toHaveAccessibleDescription(
      "Introdu un număr de telefon în format internațional, de exemplu +40712345678.",
    );
    expect(mocks.createPerson).not.toHaveBeenCalled();
  });

  it("shows a generic create API error without marking unrelated fields", async () => {
    mocks.createPerson.mockRejectedValueOnce(
      new ApiError(503, "Service unavailable."),
    );
    const browser = userEvent.setup();
    await renderReviewForm(browser);
    fillRequiredFields();
    await saveNationalIdDocument(browser);
    await submitPerson(browser);
    expect(await screen.findByText("Service unavailable.")).toBeInTheDocument();
    showReviewStep("Contact details");
    expect(screen.getByLabelText("Phone")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("preserves incomplete and invalid date validation in the review step", async () => {
    const browser = userEvent.setup();
    renderCreateForm();
    await enterDocuments(browser, "foreign");
    await uploadPhoto(browser, "Passport");
    await browser.click(screen.getByRole("button", { name: "Review details" }));
    fillRequiredFields();
    changeField("Date of birth", "28");
    await submitPerson(browser);
    expect(await screen.findAllByText("Complete Date of birth.")).toHaveLength(
      2,
    );
    expect(screen.getByLabelText("Date of birth")).toHaveAccessibleDescription(
      "Complete Date of birth.",
    );
    expect(screen.getByLabelText("Date of birth MM")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    changeField("Date of birth", "31");
    changeField("Date of birth MM", "02");
    changeField("Date of birth YYYY", "1990");
    await submitPerson(browser);
    expect(
      await screen.findAllByText("Enter a valid Date of birth."),
    ).toHaveLength(2);
    expect(mocks.createPerson).not.toHaveBeenCalled();
  });

  it("shows the Romanian under-18 warning from the entered CNP", async () => {
    const browser = userEvent.setup();
    await renderReviewForm(browser);
    changeField("CNP", "5100626123456");
    expect(
      await screen.findByText(
        "This person is under 18 years old. Review eligibility before continuing.",
      ),
    ).toBeInTheDocument();
    expect(mocks.createPerson).not.toHaveBeenCalled();
  });

  it("shows the foreign under-18 warning from the entered birth date", async () => {
    const browser = userEvent.setup();
    renderCreateForm();
    await enterDocuments(browser, "foreign");
    await uploadPhoto(browser, "Passport");
    await browser.click(screen.getByRole("button", { name: "Review details" }));
    changeField("Date of birth", "26");
    changeField("Date of birth MM", "06");
    changeField("Date of birth YYYY", "2010");
    expect(
      await screen.findByText(
        "This person is under 18 years old. Review eligibility before continuing.",
      ),
    ).toBeInTheDocument();
    expect(mocks.createPerson).not.toHaveBeenCalled();
  });

  it.each(["phone", "email"] as const)(
    "marks %s conflicts inline without navigating away",
    async (field) => {
      mocks.createPerson.mockRejectedValueOnce(
        new ApiError(
          409,
          `${field} already exists.`,
          `PERSON_${field.toUpperCase()}_CONFLICT`,
          { field },
        ),
      );
      const browser = userEvent.setup();
      await renderReviewForm(browser);
      fillRequiredFields();
      await saveNationalIdDocument(browser);
      await submitPerson(browser);
      expect(
        await screen.findAllByText(`${field} already exists.`),
      ).toHaveLength(2);
      expect(
        screen.getByLabelText(field === "phone" ? "Phone" : "Email"),
      ).toHaveAttribute("aria-invalid", "true");
      expect(mocks.push).not.toHaveBeenCalled();
    },
  );
});

describe("document extraction review", () => {
  it("fills county, locality and person CNP from the national ID and keeps them editable", async () => {
    mocks.extractDocument.mockResolvedValue({
      documentType: "nationalId",
      detectedDocumentType: "nationalId",
      sourceUploadIds: ["source"],
      reviewRequired: true,
      licenseCategories: [],
      warnings: [],
      suggestions: [
        {
          target: "person",
          field: "cnp",
          value: "1900228123450",
          sourceSlot: "front",
          needsReview: false,
        },
        {
          target: "person",
          field: "region",
          value: "Vâlcea",
          sourceSlot: "front",
          needsReview: false,
        },
        {
          target: "person",
          field: "city",
          value: "Râmnicu Vâlcea",
          sourceSlot: "front",
          needsReview: false,
        },
      ],
    });
    const browser = userEvent.setup();
    await renderReviewForm(browser);
    expect(screen.getByLabelText("CNP")).toHaveValue("1900228123450");
    showReviewStep("Address");
    expect(
      screen.getByRole("button", { name: /^County(?: |$)/ }),
    ).toHaveTextContent("Vâlcea");
    expect(
      screen.getByRole("button", { name: /^Locality(?: |$)/ }),
    ).toHaveTextContent("Râmnicu Vâlcea");
    await selectAddressOption(browser, "Locality", "Drăgășani");
    expect(
      screen.getByRole("button", { name: /^Locality(?: |$)/ }),
    ).toHaveTextContent("Drăgășani");
    showReviewStep("Document details");
    await browser.click(
      screen.getByRole("button", { name: /^(Add|Edit) National ID$/ }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: /^(Add|Edit) document$/,
    });
    expect(within(dialog).queryByLabelText("CNP")).not.toBeInTheDocument();
  });

  it("prefills editable fields with visible sources and uncertainty", async () => {
    mocks.extractDocument.mockResolvedValue(extractedPassport());
    const browser = userEvent.setup();
    renderCreateForm();
    await enterDocuments(browser, "foreign");
    await uploadPhoto(browser, "Passport");
    await browser.click(screen.getByRole("button", { name: "Review details" }));
    expect(screen.getByLabelText("First name")).toHaveValue("Ana");
    expect(screen.getByLabelText("Last name")).toHaveValue("Popescu");
    expect(
      screen.getByText(/From Passport · Front · Check this value/),
    ).toBeInTheDocument();
    changeField("First name", "");
    const useSuggestion = screen.getByRole("button", {
      name: "Use Ana from Passport",
    });
    await browser.click(useSuggestion);
    expect(screen.getByLabelText("First name")).toHaveValue("Ana");
  });

  it.each(["Save", "Cancel"])(
    "%s in a document editor preserves extraction arriving during local edits",
    async (action) => {
      let resolve!: (value: v1.persons.PersonDocumentExtraction) => void;
      mocks.extractDocument.mockReturnValue(
        new Promise((done) => {
          resolve = done;
        }),
      );
      const browser = userEvent.setup();
      renderCreateForm();
      await enterDocuments(browser, "foreign");
      await uploadPhoto(browser, "Passport");
      await browser.click(
        screen.getByRole("button", { name: "Review details" }),
      );
      expect(
        screen.getByRole("status", {
          name: "Reading First name from document…",
        }),
      ).toBeInTheDocument();
      changeField("First name", "Operator");
      expect(
        screen.queryByRole("status", {
          name: "Reading First name from document…",
        }),
      ).not.toBeInTheDocument();
      showReviewStep("Document details");
      await browser.click(
        screen.getByRole("button", { name: /^(Add|Edit) Passport$/ }),
      );
      const dialog = await screen.findByRole("dialog", {
        name: /^(Add|Edit) document$/,
      });
      expect(within(dialog).queryByLabelText("Series")).not.toBeInTheDocument();
      expect(
        within(dialog).getByRole("status", {
          name: "Reading ID number from document…",
        }),
      ).toBeInTheDocument();
      changeDialogField(dialog, "ID number", "LOCAL");
      expect(
        within(dialog).queryByRole("status", {
          name: "Reading ID number from document…",
        }),
      ).not.toBeInTheDocument();
      await act(async () => resolve(extractedPassport()));
      expect(
        within(dialog).queryByRole("status", {
          name: /^Reading .* from document/,
        }),
      ).not.toBeInTheDocument();
      expect(within(dialog).getByLabelText("ID number")).toHaveValue("LOCAL");
      expect(within(dialog).getByLabelText("Issued by")).toHaveValue(
        "Passport office",
      );
      await browser.click(within(dialog).getByRole("button", { name: action }));
      await waitFor(() => expect(dialog).not.toBeInTheDocument());
      showReviewStep("Personal details");
      expect(screen.getByLabelText("First name")).toHaveValue("Operator");
      expect(screen.getByLabelText("Last name")).toHaveValue("Popescu");
      showReviewStep("Document details");
      await browser.click(
        screen.getByRole("button", { name: "Edit Passport" }),
      );
      const reopened = await screen.findByRole("dialog", {
        name: "Edit document",
      });
      expect(within(reopened).getByLabelText("ID number")).toHaveValue(
        action === "Save" ? "LOCAL" : "EXTRACTED",
      );
      expect(within(reopened).getByLabelText("Issued by")).toHaveValue(
        "Passport office",
      );
    },
  );

  it("blocks creation while reading and allows explicit manual completion", async () => {
    let resolve!: (value: v1.persons.PersonDocumentExtraction) => void;
    mocks.extractDocument.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const browser = userEvent.setup();
    renderCreateForm();
    await enterDocuments(browser, "foreign");
    await uploadPhoto(browser, "Passport");
    await browser.click(screen.getByRole("button", { name: "Review details" }));
    fillRequiredFields();
    showReviewStep("Document details");
    expect(
      screen.getByRole("button", { name: "Create person" }),
    ).toBeDisabled();
    await browser.click(
      screen.getByRole("button", { name: "Continue manually" }),
    );
    await act(async () => resolve(extractedPassport()));
    showReviewStep("Personal details");
    expect(screen.getByLabelText("First name")).toHaveValue("Grace");
    await submitPerson(browser);
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/en/persons/person-2"),
    );
    expect(mocks.createPerson).toHaveBeenCalledTimes(1);
  });
});

function extractedPassport(): v1.persons.PersonDocumentExtraction {
  return {
    documentType: "passport",
    detectedDocumentType: "passport",
    sourceUploadIds: ["source"],
    reviewRequired: true,
    suggestions: [
      {
        target: "person",
        field: "firstName",
        value: "Ana",
        sourceSlot: "front",
        needsReview: true,
      },
      {
        target: "person",
        field: "lastName",
        value: "Popescu",
        sourceSlot: "front",
        needsReview: false,
      },
      {
        target: "document",
        field: "number",
        value: "EXTRACTED",
        sourceSlot: "front",
        needsReview: false,
      },
      {
        target: "document",
        field: "issuedBy",
        value: "Passport office",
        sourceSlot: "front",
        needsReview: false,
      },
    ],
    licenseCategories: [],
    warnings: [],
  };
}

function renderCreateForm(locale: SupportedLocale = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <PersonCreateForm
        personsHref={locale === "en" ? "/en/persons" : "/persons"}
      />
    </NextIntlClientProvider>,
  );
}

async function enterDocuments(
  browser: ReturnType<typeof userEvent.setup>,
  citizenship: "romanian" | "foreign" = "romanian",
  format: "classic" | "electronic" = "classic",
) {
  await browser.click(
    screen.getByRole("button", {
      name: citizenship === "romanian" ? "Romanian citizen" : "Foreign citizen",
    }),
  );
  if (citizenship === "romanian")
    await browser.click(
      screen.getByRole("button", {
        name: format === "classic" ? "Old national ID" : "Electronic ID (CEI)",
      }),
    );
}

async function renderReviewForm(browser: ReturnType<typeof userEvent.setup>) {
  renderCreateForm();
  await enterDocuments(browser);
  await uploadPhoto(browser, "National ID");
  await browser.click(screen.getByRole("button", { name: "Review details" }));
}

function getPhotoGroup(name: string) {
  return within(
    screen.getByRole("region", { name: "Document photos" }),
  ).getByRole("group", { name });
}

async function uploadPhoto(
  browser: ReturnType<typeof userEvent.setup>,
  document: string,
  slot: "Front" | "Back" = "Front",
) {
  await browser.click(
    within(getPhotoGroup(document)).getByRole("button", {
      name: `Add ${slot} photo`,
    }),
  );
  const dialog = await screen.findByRole("dialog", { name: `${slot} photo` });
  await browser.upload(
    within(dialog).getByLabelText("Choose from files"),
    new File(["photo"], `${slot}.png`, { type: "image/png" }),
  );
  expect(
    within(dialog).getByRole("img", { name: `${slot} document photo` }),
  ).toBeInTheDocument();
  await browser.click(
    within(dialog).getByRole("button", { name: "Use photo" }),
  );
  await waitFor(() => expect(dialog).not.toBeInTheDocument());
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Review details" }),
    ).toBeEnabled(),
  );
}

function fillRequiredFields(phone = "749096855") {
  changeField("First name", "Grace");
  changeField("Last name", "Hopper");
  changeField("Email", "rider@example.com");
  changeField("Phone", phone);
}

async function openNationalIdSheet(
  browser: ReturnType<typeof userEvent.setup>,
) {
  showReviewStep("Document details");
  await browser.click(
    screen.getByRole("button", { name: /^(Add|Edit) National ID$/ }),
  );
  return screen.findByRole("dialog", { name: /^(Add|Edit) document$/ });
}

async function saveNationalIdDocument(
  browser: ReturnType<typeof userEvent.setup>,
) {
  changeField("CNP", "1900228123450");
  const dialog = await openNationalIdSheet(browser);
  await browser.click(
    within(dialog).getByRole("switch", { name: "Document has expiry date?" }),
  );
  await saveDocumentSheet(browser, dialog);
}

async function saveDocumentSheet(
  browser: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
) {
  const save = within(dialog).getByRole("button", { name: "Save" });
  await waitFor(() => expect(save).toBeEnabled());
  await browser.click(save);
  await waitFor(() => expect(dialog).not.toBeInTheDocument());
}

function changeDialogField(dialog: HTMLElement, label: string, value: string) {
  fireEvent.change(within(dialog).getByLabelText(label), { target: { value } });
}

function fillDialogDateParts(
  dialog: HTMLElement,
  label: string,
  value: { day: string; month: string; year: string },
) {
  changeDialogField(dialog, label, value.day);
  changeDialogField(dialog, `${label} MM`, value.month);
  changeDialogField(dialog, `${label} YYYY`, value.year);
}

async function selectAddressOption(
  browser: ReturnType<typeof userEvent.setup>,
  label: string,
  value: string,
) {
  await browser.click(
    screen.getByRole("button", { name: new RegExp(`^${label}(?: |$)`) }),
  );
  const dialog = await screen.findByRole("dialog", { name: label });
  await browser.click(within(dialog).getByRole("button", { name: value }));
  await waitFor(() => expect(dialog).not.toBeInTheDocument());
}

function changeField(label: string, value: string) {
  showField(label);
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function showReviewStep(name: string) {
  const progress = screen.getByRole("list", {
    name: /Add person progress|Pași pentru adăugarea persoanei/,
  });
  fireEvent.click(within(progress).getByRole("button", { name }));
}

function showField(label: string) {
  if (screen.queryByLabelText(label)) return;
  const ro = Boolean(
    screen.queryByRole("list", { name: "Pași pentru adăugarea persoanei" }),
  );
  const step = /^(First name|Last name|CNP|Date of birth|Prenume|Nume)/.test(
    label,
  )
    ? ro
      ? "Date personale"
      : "Personal details"
    : /^(Email|Phone|Telefon)/.test(label)
      ? ro
        ? "Date de contact"
        : "Contact details"
      : label === "Notes"
        ? "Document details"
        : ro
          ? "Adresă"
          : "Address";
  showReviewStep(step);
}

async function submitPerson(browser: ReturnType<typeof userEvent.setup>) {
  showReviewStep("Document details");
  await browser.click(screen.getByRole("button", { name: "Create person" }));
}
