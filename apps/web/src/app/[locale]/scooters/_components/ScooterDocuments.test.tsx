import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScooterDocumentUpload } from "./ScooterDocumentUpload";
import { useScooterDocuments } from "./useScooterDocuments";
import { ScooterCreateForm } from "./ScooterCreateForm";
import { ScooterEditForm } from "./ScooterEditForm";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  put: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  webApi: {
    fetch: mocks.api,
    url: (path: string) => `https://api.example.com${path}`,
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
const brands = [
  {
    id: "brand",
    name: "Yamaha",
    code: "YAM",
    scooterCount: 0,
    createdAt: "",
    updatedAt: "",
  },
];
const existing: v1.scooters.ScooterDocument = {
  id: "doc",
  type: "civ",
  fileName: "old.pdf",
  contentType: "application/pdf",
  byteSize: 50,
  createdAt: "",
  contentUrl: "/v1/scooters/s/documents/doc/content",
};
const scooter: v1.scooters.Scooter = {
  id: "s",
  vin: "LXYTCKP05P0000001",
  brandId: "brand",
  brand: "Yamaha",
  model: null,
  color: null,
  manufactureYear: null,
  engineCode: null,
  engineDisplacementCc: null,
  powerKw: null,
  powertrainType: "combustion",
  registrationType: "unregistered",
  registrationNumber: null,
  registrationDate: null,
  temporaryRegistrationExpiresAt: null,
  requiredLicenseCategory: "none",
  currentMileageKm: null,
  notes: null,
  createdAt: "",
  updatedAt: "",
  deletedAt: null,
  documents: [existing],
};
function renderWithMessages(child: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      {child}
    </NextIntlClientProvider>,
  );
}
function Harness({
  initial = [existing],
}: {
  initial?: v1.scooters.ScooterDocument[];
}) {
  const documents = useScooterDocuments(initial);
  return (
    <>
      <ScooterDocumentUpload
        type="civ"
        documents={documents}
        disabled={false}
      />
      <button disabled={documents.blocked}>Save test</button>
    </>
  );
}
function pdf() {
  const file = new File(["%PDF"], "CIV.pdf", { type: "application/pdf" });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => new ArrayBuffer(4),
  });
  return file;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mocks.put);
  vi.stubGlobal("crypto", {
    randomUUID: vi.fn(() => "draft-id"),
    subtle: { digest: vi.fn(async () => new ArrayBuffer(32)) },
  });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:preview"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  mocks.api.mockImplementation(async (path: string) =>
    path === v1.scooters.ROUTES.documents.createDraftUpload
      ? {
          uploadUrl: "https://s3.example.com/upload",
          uploadToken: "token",
          method: "PUT",
          headers: { "Content-Type": "application/pdf" },
          expiresAt: "",
          maxBytes: 10_485_760,
        }
      : scooter,
  );
  mocks.put.mockResolvedValue({ ok: true });
});
afterEach(() => vi.unstubAllGlobals());

describe("Scooter documents", () => {
  it("previews existing PDFs in the shared full-screen viewer with an open-file fallback", async () => {
    const browser = userEvent.setup();
    renderWithMessages(<Harness />);
    await browser.click(
      screen.getByRole("button", { name: "Preview old.pdf" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "old.pdf" });
    expect(dialog).toHaveClass(
      "h-dvh",
      "bg-popover",
      "text-popover-foreground",
    );
    expect(
      dialog.querySelector('[data-slot="pdf-preview"]'),
    ).toBeInTheDocument();
    await browser.click(
      screen.getByRole("button", { name: "Document actions" }),
    );
    expect(
      await screen.findByRole("menuitem", { name: "Open file in new tab" }),
    ).toHaveAttribute(
      "href",
      "https://api.example.com/v1/scooters/s/documents/doc/content",
    );
    await browser.keyboard("{Escape}");
    await browser.click(screen.getByRole("button", { name: "Close preview" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("shows local image previews and revokes the object URL on removal", async () => {
    const browser = userEvent.setup();
    renderWithMessages(<Harness initial={[]} />);
    const file = new File(["image"], "front.png", { type: "image/png" });
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => new ArrayBuffer(4),
    });
    await browser.upload(
      screen.getByLabelText("Add Vehicle identity card (CIV)", {
        selector: "input",
      }),
      file,
    );
    await browser.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Save",
      }),
    );
    expect(
      await screen.findByRole("img", { name: "front.png" }),
    ).toHaveAttribute("src", "blob:preview");
    await browser.click(
      screen.getByRole("button", { name: "Preview front.png" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "front.png" }),
    ).toBeInTheDocument();
    await browser.click(
      screen.getByRole("button", { name: "Document actions" }),
    );
    await browser.click(
      await screen.findByRole("menuitem", { name: "Remove" }),
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });

  it("places each upload before the fields it describes", () => {
    renderWithMessages(
      <ScooterCreateForm brands={brands} scootersHref="/scooters" />,
    );
    const civ = screen.getByLabelText("Add Vehicle identity card (CIV)", {
      selector: "input",
    });
    const certificate = screen.getByLabelText("Add Registration certificate", {
      selector: "input",
    });
    expect(
      civ.compareDocumentPosition(screen.getByLabelText(/VIN/)) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      certificate.compareDocumentPosition(
        screen.getByLabelText("Registration type"),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
  it("retains failed uploads for retry and blocks save until ready", async () => {
    mocks.put.mockResolvedValueOnce({ ok: false });
    const user = userEvent.setup();
    renderWithMessages(<Harness initial={[]} />);
    await user.upload(
      screen.getByLabelText("Add Vehicle identity card (CIV)", {
        selector: "input",
      }),
      pdf(),
    );
    expect(mocks.api).not.toHaveBeenCalled();
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Save",
      }),
    );
    expect(await screen.findByText("Upload failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save test" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Retry upload" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save test" })).toBeEnabled(),
    );
    expect(screen.queryByText("Ready to save")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save test" })).toBeEnabled();
    expect(mocks.api).toHaveBeenLastCalledWith(
      v1.scooters.ROUTES.documents.createDraftUpload,
      v1.scooters.scooterDocumentUploadSchema,
      expect.objectContaining({
        json: expect.objectContaining({
          type: "civ",
          contentType: "application/pdf",
        }),
      }),
    );
    await removeFromViewer(user, "CIV.pdf");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });
  it("shows only an upload overlay and removes every action below a ready preview", async () => {
    let finish!: (result: { ok: boolean }) => void;
    mocks.put.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const user = userEvent.setup();
    const { container } = renderWithMessages(<Harness initial={[]} />);
    await user.upload(
      screen.getByLabelText("Add Vehicle identity card (CIV)", {
        selector: "input",
      }),
      pdf(),
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="document-upload-overlay"]'),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "Add Vehicle identity card (CIV)" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "CIV.pdf" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove" }),
    ).not.toBeInTheDocument();
    finish({ ok: true });
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="document-upload-overlay"]'),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("Ready to save")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Preview CIV.pdf" }),
    ).toHaveAttribute("aria-busy", "false");
  });
  it("rejects unsupported and oversized files before requesting an upload", async () => {
    renderWithMessages(<Harness initial={[]} />);
    const input = screen.getByLabelText("Add Vehicle identity card (CIV)", {
      selector: "input",
    });
    fireEvent.change(input, {
      target: {
        files: [new File(["svg"], "x.svg", { type: "image/svg+xml" })],
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a non-empty",
    );
    const file = pdf();
    Object.defineProperty(file, "size", { value: 20_000_000 });
    fireEvent.change(input, { target: { files: [file] } });
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it("stages removal, supports undo, and saves document-only edits", async () => {
    const user = userEvent.setup();
    renderWithMessages(
      <ScooterEditForm
        scooter={scooter}
        brands={brands}
        scooterHref="/scooters/s"
      />,
    );
    expect(
      screen.queryByRole("link", { name: "old.pdf" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await removeFromViewer(user, "old.pdf");
    expect(mocks.api).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Undo removal" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await removeFromViewer(user, "old.pdf");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        v1.scooters.ROUTES.update("s"),
        v1.scooters.scooterSchema,
        { method: "PATCH", json: { removedDocumentIds: ["doc"] } },
      ),
    );
  });
  it("includes uploaded drafts when saving and preserves them after a failed save", async () => {
    const user = userEvent.setup();
    renderWithMessages(
      <ScooterEditForm
        scooter={{ ...scooter, documents: [] }}
        brands={brands}
        scooterHref="/scooters/s"
      />,
    );
    await user.upload(
      screen.getByLabelText("Add Vehicle identity card (CIV)", {
        selector: "input",
      }),
      pdf(),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Save",
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled(),
    );
    mocks.api.mockRejectedValueOnce(new Error("Offline"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled(),
    );
    expect(screen.queryByText("Ready to save")).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalled());
    expect(mocks.api).toHaveBeenLastCalledWith(
      v1.scooters.ROUTES.update("s"),
      v1.scooters.scooterSchema,
      {
        method: "PATCH",
        json: {
          documentDrafts: [
            { type: "civ", fileName: "CIV.pdf", uploadToken: "token" },
          ],
        },
      },
    );
  });
});

async function removeFromViewer(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  await user.click(screen.getByRole("button", { name: `Preview ${name}` }));
  await user.click(screen.getByRole("button", { name: "Document actions" }));
  await user.click(await screen.findByRole("menuitem", { name: "Remove" }));
}
