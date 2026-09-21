import { v1 } from "@repo/api-shared";
import { messages, type SupportedLocale } from "@repo/i18n";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ScooterDetailPage } from "./ScooterDetailPage";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  webApi: {
    fetch: mocks.apiFetch,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mocks.refresh,
    replace: mocks.replace,
    push: mocks.push,
  }),
}));

const scooter: v1.scooters.Scooter = {
  id: "scooter-1",
  vin: "JYARN23E0RA123456",
  brandId: "brand-yamaha",
  brand: "Yamaha",
  model: "NMAX",
  color: "White",
  manufactureYear: 2026,
  powertrainType: "combustion",
  engineType: null,
  engineCc: 125,
  powerKw: 8.5,
  registrationType: "unregistered",
  plateNumber: null,
  registeredOn: null,
  registrationExpiresOn: null,
  requiredDriverLicenseType: "none",
  currentMileageKm: 1_200,
  notes: "Maker papers received",
  createdAt: "2026-06-25T10:00:00.000Z",
  updatedAt: "2026-06-25T11:00:00.000Z",
  deletedAt: null,
};

beforeEach(() => {
  mocks.apiFetch.mockReset();
  mocks.refresh.mockReset();
  mocks.replace.mockReset();

  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: MouseEvent,
  });
});

describe("ScooterDetailPage", () => {
  it("renders scooter details and actions", () => {
    renderDetail();

    expect(
      screen.getByRole("heading", { name: "Yamaha NMAX" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("JYARN23E0RA123456")[0]).toBeInTheDocument();
    expect(screen.getByText("White")).toBeInTheDocument();
    expect(screen.getAllByText("125 cc")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Unregistered")[0]).toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add registration" }),
    ).not.toBeInTheDocument();
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
      screen.getByRole("heading", { name: "Yamaha NMAX" }),
    );
    expect(
      screen.queryByRole("heading", { name: "Maintenance and repairs" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("1,200")).toBeInTheDocument();
  });

  it("shows a status badge only for deleted scooters", () => {
    renderDetail("en", { ...scooter, deletedAt: "2026-08-03T12:00:00.000Z" });

    expect(
      screen
        .getAllByText("Deleted")
        .some((element) => element.dataset.slot === "badge"),
    ).toBe(true);
  });

  it("adds scooter registration from the focused dialog", async () => {
    mocks.apiFetch.mockResolvedValueOnce({
      ...scooter,
      registrationType: "national",
      plateNumber: "CJ 12 ABC",
      registeredOn: "2026-01-16",
      requiredDriverLicenseType: "A1",
    });
    const browser = userEvent.setup();

    renderDetail();
    await browser.click(screen.getByRole("button", { name: "More actions" }));
    await browser.click(await screen.findByText("Add registration"));
    const dialog = await screen.findByRole("dialog", {
      name: "Add registration",
    });
    await chooseSelectOption(browser, "Registration type", "National");
    await browser.type(
      within(dialog).getByLabelText("Plate number"),
      "cj12abc",
    );
    await fillDateParts(browser, dialog, "Registered on", "2026-01-16");
    await chooseSelectOption(browser, "Required driver license", "A1");
    await browser.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.scooters.ROUTES.update(scooter.id),
        v1.scooters.scooterSchema,
        {
          method: "PATCH",
          json: {
            registrationType: "national",
            plateNumber: "CJ 12 ABC",
            registeredOn: "2026-01-16",
            registrationExpiresOn: null,
            requiredDriverLicenseType: "A1",
          },
        },
      ),
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("shows edit registration for registered scooters", async () => {
    const browser = userEvent.setup();

    renderDetail("en", {
      ...scooter,
      registrationType: "national",
      plateNumber: "CJ 12 ABC",
      registeredOn: "2026-01-16",
      requiredDriverLicenseType: "A1",
    });

    await browser.click(screen.getByRole("button", { name: "More actions" }));
    expect(await screen.findByText("Edit registration")).toBeInTheDocument();
    expect(screen.queryByText("Add registration")).not.toBeInTheDocument();
    expect(screen.getAllByText("National")[0]).toBeInTheDocument();
    expect(screen.getByText("CJ 12 ABC")).toBeInTheDocument();
    expect(
      screen.queryByText("Registration expires on"),
    ).not.toBeInTheDocument();
  });

  it("navigates to the edit page from the actions menu", async () => {
    const browser = userEvent.setup();

    renderDetail();
    await browser.click(screen.getByRole("button", { name: "More actions" }));
    await browser.click(await screen.findByText("Edit scooter"));

    expect(mocks.push).toHaveBeenCalledWith(`/en/scooters/${scooter.id}/edit`);
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("soft-deletes the scooter with confirmation", async () => {
    mocks.apiFetch.mockResolvedValueOnce(undefined);
    const browser = userEvent.setup();

    renderDetail();
    await browser.click(screen.getByRole("button", { name: "More actions" }));
    await browser.click(await screen.findByText("Delete scooter"));
    const dialog = await screen.findByRole("dialog");
    await browser.click(
      within(dialog).getByRole("button", { name: "Delete scooter" }),
    );

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.scooters.ROUTES.delete(scooter.id),
        v1.common.noContentSchema,
        { method: "DELETE" },
      ),
    );
    expect(mocks.replace).toHaveBeenCalledWith("/en/scooters");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});

function renderDetail(
  locale: SupportedLocale = "en",
  scooterOverride: v1.scooters.Scooter = scooter,
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <ScooterDetailPage
        scooter={scooterOverride}
        scootersHref={locale === "en" ? "/en/scooters" : "/scooters"}
      />
    </NextIntlClientProvider>,
  );
}

async function chooseSelectOption(
  browser: ReturnType<typeof userEvent.setup>,
  label: string,
  option: string,
) {
  await browser.click(screen.getByRole("combobox", { name: label }));
  await browser.click(await screen.findByRole("option", { name: option }));
}

async function fillDateParts(
  browser: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  label: string,
  value: string,
) {
  const [year, month, day] = value.split("-");

  await browser.type(within(dialog).getByLabelText(label), day ?? "");
  await browser.type(within(dialog).getByLabelText(`${label} MM`), month ?? "");
  await browser.type(
    within(dialog).getByLabelText(`${label} YYYY`),
    year ?? "",
  );
}
