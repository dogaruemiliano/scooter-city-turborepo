import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import { v1 } from "@repo/api-shared";
import { beforeEach, expect, it, vi } from "vitest";
import { ContractTemplatesWorkspace } from "./ContractTemplatesWorkspace";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  user: {
    id: "publisher",
    effectiveScopes: {
      "templates.read": ["ALL"],
      "templates.publish": ["ALL"],
      "templates.archive": ["ALL"],
    } as Record<string, string[]>,
  },
}));
vi.mock("@/lib/api", () => ({ webApi: { fetch: mocks.fetch } }));
vi.mock("@/components/auth/SessionProvider", () => ({
  useSession: () => ({ user: mocks.user }),
}));
const hash = "a".repeat(64);
beforeEach(() => {
  mocks.fetch.mockReset();
  delete mocks.user.effectiveScopes["templates.manage"];
});

function approvedSettings() {
  return v1.contracts.contractSettingsInputSchema.parse({
    brandName: "Scooter City",
    gpsHistoryStatement: "Approved synthetic GPS history statement.",
    logoAssetId: null,
    registryNumber: "J12/34/2020",
    address: "Example registered address",
    city: "București",
    county: "București",
    phone: "+40712345678",
    email: "office@example.test",
    iban: "RO00BANK0000000000000000",
    bank: "Example bank",
    representativeUserId: "representative",
    representativeCapacity: "Administrator",
    selfieNotice:
      "Approved synthetic notice explaining purpose, legal basis, access, rights and retention.",
    selfieNoticeVersion: "fixture-v1",
    signingAcceptanceText:
      "Approved synthetic acceptance with payment obligation.",
    privacyRetentionDays: 30,
    contractRetentionDays: 3650,
    legalReviewStatement:
      "This configuration is approved for synthetic test use only.",
  });
}

it("sets an uploaded logo only after success and preserves other settings entered during upload", async () => {
  mocks.user.effectiveScopes["templates.manage"] = ["ALL"];
  let settings = approvedSettings();
  let finishUpload!: (value: unknown) => void;
  mocks.fetch.mockImplementation(async (url, schema, options) => {
    if (url === "/v1/contracts/templates")
      return schema.parse({ items: [], sets: [], activeSetId: null });
    if (url === "/v1/contracts/settings/logo") {
      expect(options.body).toBeInstanceOf(FormData);
      return new Promise((resolve) => {
        finishUpload = resolve;
      });
    }
    if (url === "/v1/contracts/settings") {
      if (options?.method === "PUT") settings = options.json;
      return schema.parse({ companyId: "company", settings });
    }
    throw new Error(`Unexpected request ${url}`);
  });
  show();
  fireEvent.click(
    await screen.findByText("Contract and verification settings"),
  );
  const input = await screen.findByLabelText("Company logo (PNG or JPEG)");
  const file = new File(["fixture"], "company-logo.png", { type: "image/png" });
  fireEvent.change(input, { target: { files: [file] } });
  fireEvent.click(screen.getByRole("button", { name: "Upload company logo" }));
  await screen.findByRole("button", { name: "Uploading company logo…" });
  expect(screen.queryByText(/Uploaded: company-logo/)).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Save approved settings" }),
  ).toBeDisabled();
  fireEvent.submit(
    screen
      .getByRole("button", { name: "Save approved settings" })
      .closest("form")!,
  );
  expect(
    mocks.fetch.mock.calls.some(([, , options]) => options?.method === "PUT"),
  ).toBe(false);
  fireEvent.change(
    screen.getByRole("textbox", { name: "Registered address" }),
    { target: { value: "Updated approved address" } },
  );
  finishUpload({ assetId: "authorized-company-logo" });
  await screen.findByText(
    "Uploaded: company-logo.png. Save the settings to apply it.",
  );
  expect(
    screen.getByRole("textbox", { name: "Registered address" }),
  ).toHaveValue("Updated approved address");
  expect(
    screen.queryByRole("textbox", {
      name: "Authorized logo asset ID (optional)",
    }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Save approved settings" }),
  );
  await waitFor(() =>
    expect(settings.logoAssetId).toBe("authorized-company-logo"),
  );
  expect(settings.address).toBe("Updated approved address");
});

it("preserves a failed logo selection and keeps its original action label", async () => {
  mocks.user.effectiveScopes["templates.manage"] = ["ALL"];
  mocks.fetch.mockImplementation(async (url, schema) => {
    if (url === "/v1/contracts/templates")
      return schema.parse({ items: [], sets: [], activeSetId: null });
    if (url === "/v1/contracts/settings")
      return schema.parse({
        companyId: "company",
        settings: approvedSettings(),
      });
    if (url === "/v1/contracts/settings/logo")
      throw new Error("Private storage is unavailable");
    throw new Error(`Unexpected request ${url}`);
  });
  show();
  fireEvent.click(
    await screen.findByText("Contract and verification settings"),
  );
  const input = await screen.findByLabelText("Company logo (PNG or JPEG)");
  const file = new File(["fixture"], "company-logo.png", { type: "image/png" });
  fireEvent.change(input, { target: { files: [file] } });
  fireEvent.click(screen.getByRole("button", { name: "Upload company logo" }));
  await screen.findByText("Private storage is unavailable");
  expect(
    screen.getByRole("button", { name: "Upload company logo" }),
  ).toBeEnabled();
  expect((input as HTMLInputElement).files?.[0]).toBe(file);
  expect(screen.queryByText(/Uploaded: company-logo/)).not.toBeInTheDocument();
  expect(
    screen.queryByText("A company logo is configured."),
  ).not.toBeInTheDocument();
});
function show() {
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ContractTemplatesWorkspace />
    </NextIntlClientProvider>,
  );
}

it("handles approval, publication and archival command responses without reporting a successful operation as failed", async () => {
  let version = {
    id: "version",
    templateId: "template",
    version: 1,
    status: "DRAFT",
    validationStatus: "PASSED",
    sourceSha256: hash,
    manifestHash: hash,
    validation: { status: "PASSED" },
    approvedBy: null as string | null,
    publishedAt: null as string | null,
    createdAt: "2026-10-30T00:00:00.000Z",
  };
  mocks.fetch.mockImplementation(async (url, schema, options) => {
    let payload: unknown;
    if (url === "/v1/contracts/templates")
      payload = {
        items: [
          {
            id: "template",
            type: "RENTAL_AGREEMENT",
            name: "Rental agreement",
            locale: "ro",
            versions: [version],
          },
        ],
        sets: [],
        activeSetId: null,
      };
    else if (url.endsWith("/approve")) {
      version = { ...version, approvedBy: "publisher" };
      payload = { id: "version", approved: true };
    } else if (url.endsWith("/publish")) {
      version = {
        ...version,
        status: "PUBLISHED",
        publishedAt: "2026-10-30T01:00:00.000Z",
      };
      payload = version;
    } else if (url.endsWith("/archive")) {
      version = { ...version, status: "ARCHIVED" };
      payload = { id: "version", status: "ARCHIVED" };
    } else throw new Error(`Unexpected ${options?.method ?? "GET"}: ${url}`);
    return schema.parse(payload);
  });
  show();
  fireEvent.click(await screen.findByText("Version 1 · Draft · Passed"));
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "I have reviewed the source, validation results and synthetic previews for this exact version.",
    }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Approve reviewed version" }),
  );
  await waitFor(() => expect(version.approvedBy).toBe("publisher"));
  fireEvent.click(await screen.findByText("Version 1 · Draft · Passed"));
  const publish = screen.getByRole("button", { name: "Publish version" });
  expect(publish).toBeEnabled();
  fireEvent.click(publish);
  fireEvent.click(await screen.findByText("Version 1 · Published · Passed"));
  fireEvent.click(screen.getByRole("button", { name: "Archive version" }));
  await screen.findByText("Version 1 · Archived · Passed");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("activates a compatible set with an explicit reason and expected active pointer", async () => {
  let activeSetId: string | null = null;
  const set = {
    id: "set",
    name: "Approved set",
    version: 1,
    locale: "ro",
    agreementVersionId: "agreement",
    gdprVersionId: "gdpr",
    technicalVersionId: "technical",
    promotionVersionId: null,
    promotionApproved: false,
    manifestHash: hash,
    createdAt: "2026-10-30T00:00:00.000Z",
  };
  mocks.fetch.mockImplementation(async (url, schema, options) => {
    if (url.endsWith("/activate")) {
      expect(options.json).toMatchObject({
        expectedActiveSetId: null,
        reason: "Approved for future rentals",
      });
      activeSetId = "set";
      return schema.parse({ activeSetId });
    }
    return schema.parse({ items: [], sets: [set], activeSetId });
  });
  show();
  await screen.findByText("Approved set · Version 1");
  fireEvent.change(screen.getByRole("textbox", { name: "Review reason" }), {
    target: { value: "Approved for future rentals" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Activate set" }));
  await screen.findByText("Active for new rentals");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
