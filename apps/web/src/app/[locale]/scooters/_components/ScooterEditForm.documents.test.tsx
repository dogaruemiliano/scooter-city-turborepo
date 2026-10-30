import {
  mocks,
  scooter,
  brands,
  openJsonImport,
} from "./ScooterEditForm.test-helpers";
import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import {
  render,
  screen,
  waitFor,
  within,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { ScooterEditForm } from "./ScooterEditForm";

describe("ScooterEditForm", () => {
  it("shows every attached document type, including other documents", () => {
    const documents: NonNullable<v1.scooters.Scooter["documents"]> =
      v1.scooters.SCOOTER_DOCUMENT_TYPES.map((type) => ({
        id: `document-${type}`,
        type,
        fileName: `${type}.pdf`,
        contentType: "application/pdf",
        byteSize: 100,
        contentUrl: `/documents/${type}`,
        createdAt: scooter.createdAt,
        updatedAt: scooter.updatedAt,
      }));
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ScooterEditForm
          scooter={{ ...scooter, documents }}
          brands={brands}
          scooterHref="/en/scooters"
        />
      </NextIntlClientProvider>,
    );
    expect(
      document.querySelectorAll('[data-slot="document-preview-card"]'),
    ).toHaveLength(documents.length);
    for (const document of documents)
      expect(
        screen.getAllByRole("button", {
          name: `Preview ${document.fileName}`,
        })[0],
      ).toBeInTheDocument();
    expect(
      screen.getByText("Other document", { exact: true }),
    ).toBeInTheDocument();
  });

  it("previews saved client copies and can undo removing their original before saving", async () => {
    const browser = userEvent.setup();
    const document: v1.scooters.ScooterDocument = {
      id: "saved-civ",
      type: "civ",
      fileName: "original.jpg",
      contentType: "image/jpeg",
      byteSize: 100,
      createdAt: scooter.createdAt,
      contentUrl: "/original.jpg",
      clientCopy: {
        fileName: "client.jpg",
        contentType: "image/jpeg",
        byteSize: 100,
        contentUrl: "/client.jpg",
      },
    };
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ScooterEditForm
          scooter={{ ...scooter, documents: [document] }}
          brands={brands}
          scooterHref="/en/scooters"
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Fill automatically")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add document" }),
    ).toBeInTheDocument();
    await browser.click(
      screen.getByRole("button", { name: "Preview client.jpg" }),
    );
    const viewer = await screen.findByRole("dialog", { name: "client.jpg" });
    expect(
      within(viewer).getByRole("img", { name: "client.jpg" }),
    ).toBeInTheDocument();
    await browser.click(
      within(viewer).getByRole("button", { name: "Close preview" }),
    );
    await browser.click(
      screen.getByRole("button", { name: "Remove original.jpg" }),
    );
    expect(
      screen.queryByRole("button", { name: "Preview client.jpg" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Preview original.jpg" }),
    ).not.toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: "Undo removal" }));
    expect(
      screen.getByRole("button", { name: "Preview original.jpg" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Preview client.jpg" }),
    ).toBeInTheDocument();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("fills the existing insurance document's policy and saves the normalized premium", async () => {
    const browser = userEvent.setup();
    mocks.apiFetch.mockResolvedValue(scooter);
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ScooterEditForm
          scooter={{
            ...scooter,
            insurancePolicies: [
              {
                id: "policy-1",
                insuredName: null,
                validFrom: null,
                validUntil: null,
                premiumAmount: null,
                currency: null,
                documentVin: scooter.vin,
                vinReviewConfirmed: false,
                createdAt: scooter.createdAt,
                updatedAt: scooter.updatedAt,
              },
            ],
            documents: [
              {
                id: "insurance-file",
                type: "insurance",
                insurancePolicyId: "policy-1",
                fileName: "insurance.pdf",
                contentType: "application/pdf",
                byteSize: 100,
                createdAt: scooter.createdAt,
                contentUrl: "/insurance.pdf",
              },
            ],
          }}
          brands={brands}
          scooterHref="/scooters/s"
        />
      </NextIntlClientProvider>,
    );
    const headings = screen
      .getAllByRole("heading")
      .map((heading) => heading.textContent);
    const galleryIndex = headings.findIndex((text) =>
      text?.includes("02. Photos"),
    );
    expect(galleryIndex).toBeGreaterThan(0);
    expect(headings[galleryIndex - 1]).toMatch(/01/);
    expect(headings[galleryIndex + 1]).toMatch(/03/);

    expect(screen.getByLabelText("Insured name")).toHaveValue("");
    await openJsonImport(browser);
    await browser.click(screen.getByRole("button", { name: "Edit JSON" }));
    fireEvent.change(screen.getByLabelText("Extracted data (JSON)"), {
      target: {
        value: JSON.stringify({
          documentVins: [
            {
              fileName: "insurance.pdf",
              documentType: "insurance",
              vin: scooter.vin,
            },
          ],
          insurancePolicies: [
            {
              insuredName: "Test Asigurat SRL",
              validFrom: "2026-01-01",
              validUntil: "2026-12-31",
              premiumAmount: "250,50",
              currency: "RON",
              documentVin: scooter.vin,
              sourceFileNames: ["insurance.pdf"],
            },
          ],
        }),
      },
    });
    await browser.click(screen.getByRole("button", { name: "Fill fields" }));
    expect(screen.getAllByLabelText("Insured name")).toHaveLength(1);
    expect(screen.getByLabelText("Insured name")).toHaveValue(
      "Test Asigurat SRL",
    );
    expect(screen.getByLabelText("Total premium")).toHaveValue("250.5");
    await browser.click(screen.getByRole("button", { name: /^Save changes$/ }));
    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.scooters.ROUTES.update(scooter.id),
        v1.scooters.scooterSchema,
        expect.objectContaining({
          json: expect.objectContaining({
            insurancePolicies: [
              expect.objectContaining({
                id: "policy-1",
                insuredName: "Test Asigurat SRL",
                premiumAmount: 250.5,
                currency: "RON",
              }),
            ],
          }),
        }),
      ),
    );
  });

  it("uses the known scooter VIN for unreadable sources and never imports mismatched documents", async () => {
    const browser = userEvent.setup();
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ScooterEditForm
          scooter={scooter}
          brands={brands}
          scooterHref="/scooters/s"
        />
      </NextIntlClientProvider>,
    );
    await openJsonImport(browser);
    await browser.click(screen.getByRole("button", { name: "Edit JSON" }));
    const input = screen.getByLabelText("Extracted data (JSON)");
    fireEvent.change(input, {
      target: {
        value: JSON.stringify({
          color: "Red",
          documentVins: [
            {
              fileName: "other.pdf",
              documentType: "insurance",
              vin: "LXYTCKP05P0000002",
            },
          ],
        }),
      },
    });
    await browser.click(screen.getByRole("button", { name: "Fill fields" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Document VINs do not match",
    );
    expect(screen.getByLabelText("Color")).toHaveValue("White");
    fireEvent.change(input, {
      target: {
        value: JSON.stringify({
          color: "Red",
          documentVins: [
            { fileName: "civ.pdf", documentType: "civ", vin: null },
          ],
        }),
      },
    });
    await browser.click(screen.getByRole("button", { name: "Fill fields" }));
    expect(
      screen.queryByRole("checkbox", {
        name: "I checked that all documents refer to this scooter",
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Color")).toHaveValue("Red");
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });
});

it("reuses stored extraction without a paid request or enabling Save on opening Edit", async () => {
  const document: v1.scooters.ScooterDocument = {
    id: "saved-civ",
    type: "civ",
    fileName: "CIV.png",
    contentType: "image/png",
    byteSize: 100,
    createdAt: scooter.createdAt,
    contentUrl: "/civ.png",
    extractedData: {
      vin: scooter.vin,
      fields: { model: scooter.model ?? null },
      rawFields: {},
    },
  };
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ScooterEditForm
        scooter={{ ...scooter, documents: [document] }}
        brands={brands}
        scooterHref="/en/scooters"
      />
    </NextIntlClientProvider>,
  );
  await waitFor(() =>
    expect(screen.getByText("Details extracted")).toBeInTheDocument(),
  );
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  expect(
    mocks.apiFetch.mock.calls.some(
      ([path]) => path === v1.scooters.ROUTES.documents.startExtractionJob,
    ),
  ).toBe(false);
});
