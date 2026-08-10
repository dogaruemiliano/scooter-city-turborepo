import { ApiError, v1 } from "@repo/api-shared";
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

import { PersonCreateForm } from "./PersonCreateForm";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
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
  mocks.s3Fetch.mockReset();
  mocks.push.mockReset();
  mocks.refresh.mockReset();
  vi.stubGlobal("fetch", mocks.s3Fetch);

  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: MouseEvent,
  });
});

describe("PersonCreateForm", () => {
  it("renders Romanian citizen defaults with document cards", () => {
    renderCreateForm();

    expect(screen.getByText("Contact")).toBeInTheDocument();
    expect(screen.getByText("Address")).toBeInTheDocument();
    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(requiredLabel("First name")).toHaveTextContent(/First name\s*\*/);
    expect(requiredLabel("Last name")).toHaveTextContent(/Last name\s*\*/);
    expect(requiredLabel("Email")).toHaveTextContent(/Email\s*\*/);
    expect(requiredLabel("Phone")).toHaveTextContent(/Phone\s*\*/);
    expect(requiredLabel("Country")).toHaveTextContent(/Country\s*\*/);
    expect(screen.getByLabelText("Phone country")).toHaveValue("RO");
    expect(screen.getByLabelText("Phone")).toHaveAttribute(
      "placeholder",
      "Phone number",
    );
    expect(screen.getByRole("button", { name: "Country" })).toHaveTextContent(
      "Romania",
    );
    expect(screen.getByLabelText("County")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Romanian citizen" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Foreign citizen" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByLabelText("Date of birth")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add National ID" }),
    ).toHaveAttribute("type", "button");
    expect(
      screen.getByRole("button", { name: "Add Driver license" }),
    ).toHaveAttribute("type", "button");
    expect(screen.queryByLabelText("Series")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Number")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("CNP")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Issued on")).not.toBeInTheDocument();
  });

  it("renders Romanian create page copy and localized document sheet", async () => {
    const browser = userEvent.setup();

    renderCreateForm("ro");

    expect(screen.getByText("Contact")).toBeInTheDocument();
    expect(screen.getByText("Adresă")).toBeInTheDocument();
    expect(screen.getByText("Documente")).toBeInTheDocument();
    expect(screen.getByLabelText("Prenume")).toBeInTheDocument();
    expect(screen.getByLabelText("Telefon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Țară" })).toHaveTextContent(
      "România",
    );
    expect(screen.getByLabelText("Județ")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cetățean român" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByLabelText("Tip document")).not.toBeInTheDocument();
    expect(screen.queryByText("nationalId")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Serie")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Număr")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("CNP")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Creează persoana" }),
    ).toBeInTheDocument();

    await browser.click(
      screen.getByRole("button", { name: /Carte de identitate/ }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Adaugă document",
    });

    expect(within(dialog).getByLabelText("Serie")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Număr")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("CNP")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Emis de")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Emis la")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("combobox", { name: "Stare document" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("switch", {
        name: "Documentul are data de expirare?",
      }),
    ).toBeChecked();
    expect(within(dialog).getAllByPlaceholderText("ZZ")[0]).toHaveAttribute(
      "inputmode",
      "numeric",
    );
    expect(within(dialog).getAllByPlaceholderText("LL")[0]).toHaveAttribute(
      "inputmode",
      "numeric",
    );
    expect(within(dialog).getAllByPlaceholderText("AAAA")[0]).toHaveAttribute(
      "inputmode",
      "numeric",
    );
  });

  it("switches to foreign citizen identity document mode", async () => {
    const browser = userEvent.setup();

    renderCreateForm();

    await browser.click(
      screen.getByRole("button", { name: "Foreign citizen" }),
    );

    expect(screen.getByLabelText("Date of birth")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add Passport" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add Driver license" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Document type")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("CNP")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /National ID/ }),
    ).not.toBeInTheDocument();

    await browser.click(screen.getByRole("button", { name: "Add Passport" }));
    const dialog = await screen.findByRole("dialog", { name: "Add document" });

    expect(within(dialog).getByLabelText("Document type")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("CNP")).not.toBeInTheDocument();
  });

  it("opens a driving licence sheet with number as its only identifier", async () => {
    const browser = userEvent.setup();

    renderCreateForm();
    await browser.click(
      screen.getByRole("button", { name: "Add Driver license" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Add document" });

    expect(within(dialog).queryByLabelText("Document type")).toBeNull();
    expect(within(dialog).queryByLabelText("Series")).toBeNull();
    expect(within(dialog).queryByLabelText("CNP")).toBeNull();
    expect(
      within(dialog).getByLabelText("Document number"),
    ).toBeInTheDocument();
  });

  it("opens an animated document sheet, saves, and rolls back cancel without submitting", async () => {
    const browser = userEvent.setup();

    renderCreateForm();
    fireEvent.click(screen.getByRole("button", { name: "Add National ID" }));

    expect(
      document.querySelector('[data-slot="bottom-sheet-popup"]'),
    ).toHaveAttribute("data-starting-style");
    const addDialog = await screen.findByRole("dialog", {
      name: "Add document",
    });
    const saveButton = within(addDialog).getByRole("button", { name: "Save" });
    const expirySwitch = within(addDialog).getByRole("switch", {
      name: "Document has expiry date?",
    });

    expect(saveButton).toHaveAttribute("type", "button");
    expect(expirySwitch).toBeChecked();
    expect(within(addDialog).getByLabelText("Expires on")).toHaveAttribute(
      "aria-required",
      "true",
    );
    await browser.click(saveButton);
    expect(addDialog).toBeInTheDocument();
    expect(
      within(addDialog).getByText("Expires on is required."),
    ).toBeInTheDocument();
    changeDialogField(addDialog, "Number", "123456");
    changeDialogField(addDialog, "CNP", "1900228123450");
    fillDialogDateParts(addDialog, "Expires on", {
      day: "31",
      month: "01",
      year: "2030",
    });
    await browser.click(expirySwitch);
    expect(expirySwitch).not.toBeChecked();
    expect(within(addDialog).queryByText("No expiration date")).toBeNull();
    expect(within(addDialog).getByLabelText("Expires on")).toBeDisabled();
    expect(within(addDialog).getByLabelText("Expires on MM")).toBeDisabled();
    expect(within(addDialog).getByLabelText("Expires on YYYY")).toBeDisabled();
    expect(within(addDialog).getByLabelText("Expires on")).toHaveValue("31");
    await browser.click(saveButton);

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Add document" }),
      ).not.toBeInTheDocument(),
    );
    expect(mocks.apiFetch).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();

    await browser.click(
      screen.getByRole("button", { name: "Edit National ID" }),
    );
    const editDialog = await screen.findByRole("dialog", {
      name: "Edit document",
    });

    expect(within(editDialog).getByLabelText("Number")).toHaveValue("123456");
    expect(within(editDialog).getByLabelText("CNP")).toHaveValue(
      "1900228123450",
    );
    expect(within(editDialog).getByLabelText("Expires on")).toHaveValue("31");
    expect(within(editDialog).getByLabelText("Expires on")).toBeDisabled();
    expect(
      within(editDialog).getByRole("switch", {
        name: "Document has expiry date?",
      }),
    ).not.toBeChecked();
    changeDialogField(editDialog, "Number", "654321");
    await saveDocumentSheet(browser, editDialog);

    const savedEditDialog = await openNationalIdSheet(browser);
    expect(within(savedEditDialog).getByLabelText("Number")).toHaveValue(
      "654321",
    );
    changeDialogField(savedEditDialog, "Number", "999999");
    await browser.click(
      within(savedEditDialog).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() => expect(savedEditDialog).not.toBeInTheDocument());

    const restoredEditDialog = await openNationalIdSheet(browser);
    expect(within(restoredEditDialog).getByLabelText("Number")).toHaveValue(
      "654321",
    );
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("keeps year digits as typed without leading zero padding", async () => {
    const browser = userEvent.setup();

    renderCreateForm();
    await browser.click(
      screen.getByRole("button", { name: "Foreign citizen" }),
    );
    await browser.type(screen.getByLabelText("Date of birth YYYY"), "2");

    expect(screen.getByLabelText("Date of birth YYYY")).toHaveValue("2");
  });

  it("shows required field validation inline through zod", async () => {
    const browser = userEvent.setup();

    renderCreateForm();
    await browser.click(screen.getByRole("button", { name: "Create person" }));

    const firstNameInput = screen.getByLabelText("First name");

    const alertTitle = await screen.findByText("Person not created");
    const alert = alertTitle.closest('[role="alert"]');

    expect(alertTitle).toBeInTheDocument();
    expect(alert).toHaveTextContent("Email is required.");
    expect(alert).toHaveTextContent("Phone is required.");
    expect(alert).toHaveTextContent("First name is required.");
    expect(alert).toHaveTextContent("Last name is required.");
    expect(alert?.nextElementSibling).toContainElement(
      screen.getByRole("button", { name: "Create person" }),
    );
    expect(firstNameInput).toHaveAttribute("aria-invalid", "true");
    expect(firstNameInput).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining("first-name-error"),
    );
    expect(
      document.getElementById(`${firstNameInput.id}-error`),
    ).toHaveTextContent("First name is required.");
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("normalizes a Romanian local phone and submits the full create payload", async () => {
    mocks.apiFetch.mockResolvedValueOnce(createdPerson);
    const browser = userEvent.setup();

    renderCreateForm();
    await fillFullCreateForm(browser, { phone: "0749096855" });
    await browser.click(screen.getByRole("button", { name: "Create person" }));

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.persons.ROUTES.create,
        v1.persons.personSchema,
        {
          method: "POST",
          json: {
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
                type: "nationalId",
                series: "RX",
                number: "123456",
                cnp: "1900228123450",
                issuingCountryCode: "RO",
                issuedBy: "SPCLEP Bucuresti",
                issuedOn: "2024-01-15",
                expiresOn: "2030-01-31",
                status: "verified",
              },
            ],
            notes: "Frequent rider",
          },
        },
      ),
    );
    expect(mocks.push).toHaveBeenCalledWith("/en/persons");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  }, 10_000);

  it("uploads selected document photos as drafts and submits their tokens", async () => {
    const draftUpload: v1.persons.PersonDocumentPhotoUploadUrl = {
      uploadUrl: "https://s3.test/upload/front",
      uploadToken: "draft-front-token",
      method: "PUT",
      headers: {
        "Content-Type": "image/png",
        "x-amz-checksum-sha256": "checksum-base64",
      },
      expiresAt: "2026-06-25T10:05:00.000Z",
      maxBytes: 64,
    };
    mocks.apiFetch
      .mockResolvedValueOnce(draftUpload)
      .mockResolvedValueOnce(createdPerson);
    mocks.s3Fetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
    const browser = userEvent.setup();
    const file = new File(["photo"], "front.png", { type: "image/png" });

    renderCreateForm();
    await fillFullCreateForm(browser);
    const documentDialog = await openNationalIdSheet(browser);
    await chooseDocumentPhotoFromFiles(browser, documentDialog, file);
    await waitFor(() => expect(mocks.s3Fetch).toHaveBeenCalledOnce());
    expect(
      within(documentDialog).getByRole("img", {
        name: "Front document photo",
      }),
    ).toBeInTheDocument();
    expect(
      within(documentDialog).getByRole("button", {
        name: "Change Front photo",
      }),
    ).toBeInTheDocument();
    expect(
      within(documentDialog).getByRole("button", { name: "Add Back photo" }),
    ).toBeInTheDocument();
    await saveDocumentSheet(browser, documentDialog);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Create person" }),
      ).toBeEnabled(),
    );
    await browser.click(screen.getByRole("button", { name: "Create person" }));

    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledTimes(2));
    expect(mocks.apiFetch).toHaveBeenNthCalledWith(
      1,
      v1.persons.ROUTES.documents.photos.createDraftUploadUrl,
      v1.persons.personDocumentPhotoUploadUrlSchema,
      {
        method: "POST",
        json: {
          contentType: "image/png",
          byteSize: 5,
          checksumSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      },
    );
    expect(mocks.s3Fetch).toHaveBeenCalledWith("https://s3.test/upload/front", {
      method: "PUT",
      headers: draftUpload.headers,
      body: file,
    });
    expect(mocks.apiFetch).toHaveBeenNthCalledWith(
      2,
      v1.persons.ROUTES.create,
      v1.persons.personSchema,
      {
        method: "POST",
        json: expect.objectContaining({
          documents: [
            expect.objectContaining({
              type: "nationalId",
              photos: { front: "draft-front-token" },
            }),
          ],
        }),
      },
    );
    expect(mocks.push).toHaveBeenCalledWith("/en/persons");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  }, 10_000);

  it("shows photo upload feedback when draft document photo upload fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const draftUpload: v1.persons.PersonDocumentPhotoUploadUrl = {
      uploadUrl: "https://s3.test/upload/front",
      uploadToken: "draft-front-token",
      method: "PUT",
      headers: {
        "Content-Type": "image/png",
        "x-amz-checksum-sha256": "checksum-base64",
      },
      expiresAt: "2026-06-25T10:05:00.000Z",
      maxBytes: 64,
    };
    mocks.apiFetch.mockResolvedValueOnce(draftUpload);
    mocks.s3Fetch.mockResolvedValueOnce(new Response(null, { status: 500 }));
    const browser = userEvent.setup();
    const file = new File(["photo"], "front.png", { type: "image/png" });

    renderCreateForm();
    await fillFullCreateForm(browser);
    const documentDialog = await openNationalIdSheet(browser);
    await chooseDocumentPhotoFromFiles(browser, documentDialog, file);

    expect(await screen.findByText("Photos not uploaded")).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "The selected document photo was not uploaded. Try selecting it again.",
      ),
    ).not.toHaveLength(0);
    expect(
      within(documentDialog).getByRole("button", { name: "Save" }),
    ).toBeDisabled();

    expect(mocks.apiFetch).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      "[person-document-photo] draft upload failed",
      expect.objectContaining({
        slot: "front",
        contentType: "image/png",
        byteSize: 5,
        stage: "storage-put",
        storageStatus: 500,
        errorMessage: "Storage upload returned HTTP 500",
      }),
      expect.any(Error),
    );
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    consoleError.mockRestore();
  }, 10_000);

  it("logs checksum failures before an upload request reaches the API", async () => {
    const checksumError = new TypeError("SubtleCrypto is unavailable");
    const digest = vi
      .spyOn(crypto.subtle, "digest")
      .mockRejectedValueOnce(checksumError);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const browser = userEvent.setup();
    const file = new File(["photo"], "front.png", { type: "image/png" });

    renderCreateForm();
    const documentDialog = await openNationalIdSheet(browser);
    await chooseDocumentPhotoFromFiles(browser, documentDialog, file);

    await waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        "[person-document-photo] draft upload failed",
        expect.objectContaining({
          slot: "front",
          contentType: "image/png",
          byteSize: 5,
          stage: "checksum",
          errorName: "TypeError",
          errorMessage: "SubtleCrypto is unavailable",
        }),
        checksumError,
      ),
    );
    expect(mocks.apiFetch).not.toHaveBeenCalled();

    digest.mockRestore();
    consoleError.mockRestore();
  });

  it("nests the photo chooser, keeps fallback sources available, and cancels only the child sheet", async () => {
    const browser = userEvent.setup();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });

    renderCreateForm();
    const documentDialog = await openNationalIdSheet(browser);
    expect(
      within(documentDialog).getByRole("button", { name: "Add Back photo" }),
    ).toBeInTheDocument();
    await browser.click(
      within(documentDialog).getByRole("button", {
        name: "Add Front photo",
      }),
    );
    const photoDialog = await screen.findByRole("dialog", {
      name: "Front photo",
    });

    await waitFor(() =>
      expect(documentDialog).toHaveAttribute("data-nested-drawer-open"),
    );
    expect(
      await within(photoDialog).findByText("Camera unavailable"),
    ).toBeInTheDocument();
    const galleryInput = within(photoDialog).getByLabelText(
      "Choose from gallery",
    );
    const filesInput = within(photoDialog).getByLabelText("Choose from files");

    expect(galleryInput).toHaveAttribute("type", "file");
    expect(galleryInput).toHaveAttribute("accept", "image/*");
    expect(filesInput).toHaveAttribute("type", "file");
    expect(filesInput).toHaveAttribute(
      "accept",
      "image/jpeg,image/png,image/webp",
    );
    expect(
      within(photoDialog).getByRole("button", {
        name: "Choose from gallery",
      }),
    ).toBeInTheDocument();
    expect(
      within(photoDialog).getByRole("button", { name: "Choose from files" }),
    ).toBeInTheDocument();

    await browser.click(
      within(photoDialog).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() => expect(photoDialog).not.toBeInTheDocument());

    expect(documentDialog).toBeInTheDocument();
    expect(
      within(documentDialog).getByRole("button", {
        name: "Add Front photo",
      }),
    ).toBeInTheDocument();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("rejects an invalid non-normalizable phone", async () => {
    const browser = userEvent.setup();

    renderCreateForm();
    await fillRequiredFields(browser, { phone: "123" });
    await browser.click(screen.getByRole("button", { name: "Create person" }));

    const phoneInput = screen.getByLabelText("Phone");
    const phoneError =
      "Enter a phone number in international format, e.g. +40712345678.";

    expect(await screen.findByText("Person not created")).toBeInTheDocument();
    expect(await screen.findAllByText(phoneError)).toHaveLength(2);
    expect(phoneInput).toHaveAttribute("aria-invalid", "true");
    expect(phoneInput).toHaveAccessibleDescription(phoneError);
    expect(mocks.apiFetch).not.toHaveBeenCalled();

    await browser.clear(phoneInput);
    await browser.type(phoneInput, "749096855");

    expect(phoneInput).not.toHaveAttribute("aria-invalid");
  });

  it("shows localized feedback for incomplete and invalid date parts", async () => {
    const browser = userEvent.setup();

    renderCreateForm();
    await browser.click(
      screen.getByRole("button", { name: "Foreign citizen" }),
    );
    await fillRequiredFields(browser);
    await browser.type(screen.getByLabelText("Date of birth"), "28");
    await browser.click(screen.getByRole("button", { name: "Create person" }));

    const dateOfBirthDayInput = screen.getByLabelText("Date of birth");

    expect(await screen.findAllByText("Complete Date of birth.")).toHaveLength(
      2,
    );
    expect(dateOfBirthDayInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Date of birth MM")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(dateOfBirthDayInput).toHaveAccessibleDescription(
      "Complete Date of birth.",
    );
    expect(mocks.apiFetch).not.toHaveBeenCalled();

    await browser.type(screen.getByLabelText("Date of birth MM"), "02");
    await browser.type(screen.getByLabelText("Date of birth YYYY"), "1990");
    await browser.clear(screen.getByLabelText("Date of birth"));
    await browser.type(screen.getByLabelText("Date of birth"), "31");
    await browser.click(screen.getByRole("button", { name: "Create person" }));

    expect(
      await screen.findAllByText("Enter a valid Date of birth."),
    ).toHaveLength(2);
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("shows nested document validation inline", async () => {
    const browser = userEvent.setup();

    renderCreateForm();
    await fillRequiredFields(browser);
    let documentDialog = await openNationalIdSheet(browser);
    changeDialogField(documentDialog, "CNP", "123");
    await browser.click(
      within(documentDialog).getByRole("switch", {
        name: "Document has expiry date?",
      }),
    );
    await saveDocumentSheet(browser, documentDialog);
    await browser.click(screen.getByRole("button", { name: "Create person" }));

    const cnpError = "Enter a valid CNP.";

    expect(await screen.findByText("Person not created")).toBeInTheDocument();
    expect(screen.getAllByText(cnpError).length).toBeGreaterThan(0);
    documentDialog = await openNationalIdSheet(browser);
    const cnpInput = within(documentDialog).getByLabelText("CNP");

    expect(screen.getAllByText(cnpError).length).toBeGreaterThanOrEqual(2);
    expect(cnpInput).toHaveAttribute("aria-invalid", "true");
    expect(cnpInput).toHaveAccessibleDescription(cnpError);
    expect(mocks.apiFetch).not.toHaveBeenCalled();

    await browser.clear(cnpInput);
    await browser.type(cnpInput, "1900228123450");

    expect(cnpInput).not.toHaveAttribute("aria-invalid");
  });

  it("shows Romanian validation copy inline", async () => {
    const browser = userEvent.setup();

    renderCreateForm("ro");
    await browser.type(screen.getByLabelText("Prenume"), "Ana");
    await browser.type(screen.getByLabelText("Nume"), "Ionescu");
    await browser.type(screen.getByLabelText("Email"), "ana@example.com");
    await browser.type(screen.getByLabelText("Telefon"), "123");
    await browser.click(
      screen.getByRole("button", { name: "Creează persoana" }),
    );

    const phoneInput = screen.getByLabelText("Telefon");
    const phoneError =
      "Introdu un număr de telefon în format internațional, de exemplu +40712345678.";

    expect(
      await screen.findByText("Persoana nu a fost creată"),
    ).toBeInTheDocument();
    expect(await screen.findAllByText(phoneError)).toHaveLength(2);
    expect(phoneInput).toHaveAccessibleDescription(phoneError);
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("shows an under-18 warning from Romanian CNP", async () => {
    const browser = userEvent.setup();

    renderCreateForm();
    let documentDialog = await openNationalIdSheet(browser);
    changeDialogField(documentDialog, "CNP", "5100626123456");
    await browser.click(
      within(documentDialog).getByRole("switch", {
        name: "Document has expiry date?",
      }),
    );
    await saveDocumentSheet(browser, documentDialog);
    documentDialog = await openNationalIdSheet(browser);

    expect(
      await within(documentDialog).findByText(
        "This person is under 18 years old. Review eligibility before continuing.",
      ),
    ).toBeInTheDocument();
  });

  it("shows an under-18 warning from foreign date of birth", async () => {
    const browser = userEvent.setup();

    renderCreateForm();
    await browser.click(
      screen.getByRole("button", { name: "Foreign citizen" }),
    );
    await fillDateParts(browser, "Date of birth", {
      day: "26",
      month: "06",
      year: "2010",
    });

    expect(
      await screen.findByText(
        "This person is under 18 years old. Review eligibility before continuing.",
      ),
    ).toBeInTheDocument();
  });

  it("switches non-Romanian addresses to free-text region", async () => {
    const browser = userEvent.setup();

    renderCreateForm();
    expect(screen.getByLabelText("County")).toBeInTheDocument();

    await browser.click(screen.getByRole("button", { name: "Country" }));
    await browser.type(
      await screen.findByPlaceholderText("Search countries"),
      "united states",
    );
    await browser.click(
      await screen.findByRole("button", { name: "United States" }),
    );

    expect(screen.queryByLabelText("County")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Region")).toBeInTheDocument();
    expect(screen.getByLabelText("Region")).toHaveValue("");
  });

  it("shows generic API errors when create fails", async () => {
    mocks.apiFetch.mockRejectedValueOnce(new ApiError(409, "Conflict"));
    const browser = userEvent.setup();

    renderCreateForm();
    await fillRequiredFields(browser);
    await saveNationalIdDocument(browser, { cnp: "1900228123450" });
    await browser.click(screen.getByRole("button", { name: "Create person" }));

    expect(await screen.findByText("Conflict")).toBeInTheDocument();
    expect(screen.getByLabelText("Phone")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("marks the phone field when the API returns a duplicate phone conflict", async () => {
    mocks.apiFetch.mockRejectedValueOnce(
      new ApiError(409, "Phone already exists.", "PERSON_PHONE_CONFLICT", {
        field: "phone",
      }),
    );
    const browser = userEvent.setup();

    renderCreateForm();
    await fillRequiredFields(browser);
    await saveNationalIdDocument(browser, { cnp: "1900228123450" });
    await browser.click(screen.getByRole("button", { name: "Create person" }));

    const phoneInput = screen.getByLabelText("Phone");
    expect(await screen.findAllByText("Phone already exists.")).toHaveLength(2);
    expect(phoneInput).toHaveAttribute("aria-invalid", "true");
    expect(phoneInput).toHaveAccessibleDescription("Phone already exists.");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("marks the email field when the API returns a duplicate email conflict", async () => {
    mocks.apiFetch.mockRejectedValueOnce(
      new ApiError(409, "Email already exists.", "PERSON_EMAIL_CONFLICT", {
        field: "email",
      }),
    );
    const browser = userEvent.setup();

    renderCreateForm();
    await fillRequiredFields(browser);
    await saveNationalIdDocument(browser, { cnp: "1900228123450" });
    await browser.click(screen.getByRole("button", { name: "Create person" }));

    const emailInput = screen.getByLabelText("Email");
    expect(await screen.findAllByText("Email already exists.")).toHaveLength(2);
    expect(emailInput).toHaveAttribute("aria-invalid", "true");
    expect(emailInput).toHaveAccessibleDescription("Email already exists.");
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

function renderCreateForm(locale: SupportedLocale = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <PersonCreateForm
        personsHref={locale === "en" ? "/en/persons" : "/persons"}
      />
    </NextIntlClientProvider>,
  );
}

async function fillRequiredFields(
  browser: ReturnType<typeof userEvent.setup>,
  overrides: Partial<Pick<v1.persons.CreatePersonInput, "phone">> = {},
) {
  void browser;
  changeField("First name", "Grace");
  changeField("Last name", "Hopper");
  changeField("Email", "rider@example.com");
  changeField("Phone", overrides.phone ?? "749096855");
}

async function fillFullCreateForm(
  browser: ReturnType<typeof userEvent.setup>,
  overrides: Partial<Pick<v1.persons.CreatePersonInput, "phone">> = {},
) {
  await fillRequiredFields(browser, overrides);
  await browser.selectOptions(screen.getByLabelText("County"), "București");
  changeField("Address line 1", "1 Rental Street");
  changeField("Address line 2", "Apt 4");
  changeField("City", "Bucharest");
  changeField("Postal code", "010101");
  await saveNationalIdDocument(browser, {
    series: "rx",
    number: "123456",
    cnp: "1900228123450",
    issuedBy: "SPCLEP Bucuresti",
    issuedOn: { day: "15", month: "01", year: "2024" },
    expiresOn: { day: "31", month: "01", year: "2030" },
  });
  changeField("Notes", "Frequent rider");
}

async function saveNationalIdDocument(
  browser: ReturnType<typeof userEvent.setup>,
  values: {
    series?: string;
    number?: string;
    cnp?: string;
    issuedBy?: string;
    issuedOn?: { day: string; month: string; year: string };
    expiresOn?: { day: string; month: string; year: string };
  },
) {
  const dialog = await openNationalIdSheet(browser);

  if (values.series !== undefined) {
    changeDialogField(dialog, "Series", values.series);
  }
  if (values.number !== undefined) {
    changeDialogField(dialog, "Number", values.number);
  }
  if (values.cnp !== undefined) {
    changeDialogField(dialog, "CNP", values.cnp);
  }
  if (values.issuedBy !== undefined) {
    changeDialogField(dialog, "Issued by", values.issuedBy);
  }
  if (values.issuedOn) {
    fillDialogDateParts(dialog, "Issued on", values.issuedOn);
  }
  if (values.expiresOn) {
    fillDialogDateParts(dialog, "Expires on", values.expiresOn);
  } else {
    await browser.click(
      within(dialog).getByRole("switch", {
        name: "Document has expiry date?",
      }),
    );
  }

  await saveDocumentSheet(browser, dialog);
}

async function openNationalIdSheet(
  browser: ReturnType<typeof userEvent.setup>,
): Promise<HTMLElement> {
  const addButton = screen.queryByRole("button", { name: "Add National ID" });
  const dialogTitle = addButton ? "Add document" : "Edit document";

  await browser.click(
    addButton ?? screen.getByRole("button", { name: "Edit National ID" }),
  );

  return screen.findByRole("dialog", { name: dialogTitle });
}

async function chooseDocumentPhotoFromFiles(
  browser: ReturnType<typeof userEvent.setup>,
  documentDialog: HTMLElement,
  file: File,
) {
  await browser.click(
    within(documentDialog).getByRole("button", { name: "Add Front photo" }),
  );
  const photoDialog = await screen.findByRole("dialog", {
    name: "Front photo",
  });

  await browser.upload(
    within(photoDialog).getByLabelText("Choose from files"),
    file,
  );
  expect(
    within(photoDialog).getByRole("img", { name: "Front document photo" }),
  ).toBeInTheDocument();
  await browser.click(
    within(photoDialog).getByRole("button", { name: "Use photo" }),
  );
  await waitFor(() => expect(photoDialog).not.toBeInTheDocument());
}

async function saveDocumentSheet(
  browser: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
) {
  const saveButton = within(dialog).getByRole("button", { name: "Save" });
  await waitFor(() => expect(saveButton).toBeEnabled());
  await browser.click(saveButton);
  await waitFor(() => expect(dialog).not.toBeInTheDocument());
}

function changeDialogField(dialog: HTMLElement, label: string, value: string) {
  fireEvent.change(within(dialog).getByLabelText(label), {
    target: { value },
  });
}

function fillDialogDateParts(
  dialog: HTMLElement,
  label: string,
  value: { day: string; month: string; year: string },
) {
  fireEvent.change(within(dialog).getByLabelText(label), {
    target: { value: value.day },
  });
  fireEvent.change(within(dialog).getByLabelText(`${label} MM`), {
    target: { value: value.month },
  });
  fireEvent.change(within(dialog).getByLabelText(`${label} YYYY`), {
    target: { value: value.year },
  });
}

async function fillDateParts(
  browser: ReturnType<typeof userEvent.setup>,
  label: string,
  value: { day: string; month: string; year: string },
  index = 0,
) {
  void browser;
  fireEvent.change(screen.getAllByLabelText(label)[index]!, {
    target: { value: value.day },
  });
  fireEvent.change(screen.getAllByLabelText(`${label} MM`)[index]!, {
    target: { value: value.month },
  });
  fireEvent.change(screen.getAllByLabelText(`${label} YYYY`)[index]!, {
    target: { value: value.year },
  });
}

function changeField(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function requiredLabel(controlName: string): HTMLElement {
  const control = screen.getByLabelText(controlName);
  const id = control.getAttribute("id");
  const label = id
    ? document.querySelector<HTMLLabelElement>(`label[for="${id}"]`)
    : null;

  expect(label).not.toBeNull();
  expect(label?.parentElement).not.toBeNull();
  return label!.parentElement!;
}
