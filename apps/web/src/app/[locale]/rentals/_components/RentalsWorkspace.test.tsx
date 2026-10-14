import type { ComponentProps } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RentalsWorkspace } from "./RentalsWorkspace";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  push: vi.fn(),
  user: {
    id: "staff",
    portalEligible: true,
    effectiveScopes: {} as Record<string, string[]>,
  },
}));
vi.mock("@/lib/api", () => ({ webApi: { fetch: mocks.fetch } }));
vi.mock("@/components/auth/SessionProvider", () => ({
  useSession: () => ({ user: mocks.user }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: (props: ComponentProps<"a">) => <a {...props} />,
  useRouter: () => ({ push: mocks.push }),
}));
const rental = {
  id: "rental-1",
  revision: 4,
  scooterId: "scooter-1",
  scooter: {
    fleetNumber: 7,
    brandCode: "HON",
    brandName: "Honda",
    model: "Vision",
  },
  person: { id: "person-1", firstName: "Ada", lastName: "Lovelace" },
  status: "reserved",
  startsAt: "2026-10-10T09:00:00.000Z",
  endsAt: "2026-10-15T09:00:00.000Z",
  internalNotes: "Staff only note",
  customerNotes: null,
};

beforeEach(() => {
  mocks.fetch.mockReset();
  mocks.push.mockReset();
  mocks.user.effectiveScopes = {};
  mocks.fetch.mockResolvedValue({
    items: [rental],
    total: 60,
    page: 1,
    pageSize: 25,
  });
});
function renderWorkspace(props: ComponentProps<typeof RentalsWorkspace> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <RentalsWorkspace {...props} />
    </NextIntlClientProvider>,
  );
}

describe("rental collection", () => {
  it("applies a nested status draft and returns to the first page", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await screen.findByRole("link", { name: "Honda Vision · 007 HON" });
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenLastCalledWith(
        "/v1/rentals?page=2",
        expect.anything(),
        { cache: "no-store" },
      ),
    );
    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.click(screen.getByRole("button", { name: "Status" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Status" })).getByRole(
        "button",
        { name: "Active" },
      ),
    );
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenLastCalledWith(
        "/v1/rentals?page=1&status=active",
        expect.anything(),
        { cache: "no-store" },
      ),
    );
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });

  it("preserves portal endpoint and projection even if a richer record is passed", async () => {
    mocks.user.effectiveScopes = { "rentals.create": ["ALL"] };
    renderWorkspace({ portal: true });
    const link = await screen.findByRole("link", {
      name: "Honda Vision · 007 HON",
    });
    expect(link).toHaveAttribute("href", "/my-rentals/rental-1");
    expect(mocks.fetch).toHaveBeenCalledWith(
      "/v1/portal/rentals?page=1",
      expect.anything(),
      { cache: "no-store" },
    );
    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
    expect(screen.queryByText("Staff only note")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create rental" }),
    ).not.toBeInTheDocument();
  });

  it("only offers creation to staff with its permission", async () => {
    mocks.user.effectiveScopes = { "rentals.create": ["ALL"] };
    renderWorkspace();
    await screen.findByRole("link", { name: "Honda Vision · 007 HON" });
    expect(
      screen.getByRole("button", { name: "Create rental" }),
    ).toBeInTheDocument();
  });

  it("keeps rental detail outside the collection toolbar", async () => {
    mocks.fetch.mockResolvedValue(rental);
    renderWorkspace({ id: rental.id });
    await screen.findByRole("heading", { name: "Honda Vision · 007 HON" });
    expect(mocks.fetch).toHaveBeenCalledWith(
      "/v1/rentals/rental-1",
      expect.anything(),
      { cache: "no-store" },
    );
    expect(
      screen.queryByRole("button", { name: "Filters" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Next" }),
    ).not.toBeInTheDocument();
  });
});

describe("rental detail document collections", () => {
  it("uses the shared document list for the active portal rental without staff fields", async () => {
    mocks.user.effectiveScopes = { "portal.scooter_documents.read": ["OWN"] };
    mocks.fetch.mockImplementation(async (path: string) =>
      path.endsWith("/scooter-documents")
        ? {
            items: [
              { id: "doc-1", fileName: "insurance.pdf", type: "insurance" },
            ],
          }
        : { ...rental, status: "active" },
    );
    const { container } = renderWorkspace({ portal: true, id: rental.id });
    expect(await screen.findByText("insurance.pdf")).toBeInTheDocument();
    expect(
      container.querySelector('[data-slot="list-items"]'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: messages.en.workspace.rentals.download,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
    expect(screen.queryByText("Staff only note")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: messages.en.workspace.rentals.publish,
      }),
    ).not.toBeInTheDocument();
  });

  it("does not request documents without their permission", async () => {
    mocks.fetch.mockResolvedValue({ ...rental, status: "active" });
    renderWorkspace({ portal: true, id: rental.id });
    await screen.findByRole("heading", { name: "Honda Vision · 007 HON" });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("button", {
        name: messages.en.workspace.rentals.download,
      }),
    ).not.toBeInTheDocument();
  });

  it("retains staff publication actions in the shared document list", async () => {
    const user = userEvent.setup();
    mocks.user.effectiveScopes = {
      "scooter_documents.read": ["ALL"],
      "scooter_documents.write": ["ALL"],
    };
    mocks.fetch.mockImplementation(async (path: string) =>
      path.endsWith("/documents")
        ? {
            items: [
              {
                id: "doc-1",
                fileName: "insurance.pdf",
                type: "insurance",
                customerVisible: false,
              },
            ],
          }
        : rental,
    );
    renderWorkspace({ id: rental.id });
    await screen.findByText("insurance.pdf");
    await user.click(
      screen.getByRole("button", {
        name: messages.en.workspace.rentals.publish,
      }),
    );
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        "/v1/rentals/scooter-documents/doc-1/visibility",
        expect.anything(),
        { method: "PATCH", json: { customerVisible: true } },
      ),
    );
  });
});
