import {
  mocks,
  renderWithMessages,
  Harness,
  pdf,
  removeFromViewer,
} from "./ScooterDocuments.test-helpers";
import { ApiError, v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ScooterFilePreview } from "./ScooterDocumentUpload";
import { ScooterDocumentAnalysisContext } from "./ScooterDocumentAnalysisStatus";

describe("Scooter documents", () => {
  it("shows the actual server size limit in Romanian in a standalone preview", () => {
    renderWithMessages(
      <ScooterFilePreview
        draft={{
          id: "failed-upload",
          type: "civ",
          file: pdf(),
          status: "failed",
          uploadError: "uploadLimit",
          uploadMaxBytes: 10 * 1024 * 1024,
        }}
        disabled={false}
        onReplace={() => undefined}
        validate={() => null}
      />,
      "ro",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Serverul acceptă fișiere de maximum 10 MB.",
    );
    expect(screen.queryByText("Încărcarea a eșuat")).not.toBeInTheDocument();
  });

  it("uploads a file above the old 10 MB limit and allows saving", async () => {
    const browser = userEvent.setup();
    renderWithMessages(<Harness initial={[]} />);
    const file = pdf();
    Object.defineProperty(file, "size", { value: 12 * 1024 * 1024 });
    await browser.upload(
      screen.getByLabelText("Add Vehicle identity card (CIV)", {
        selector: "input",
      }),
      file,
    );
    await browser.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save test" })).toBeEnabled(),
    );
    expect(mocks.api).toHaveBeenCalledWith(
      v1.scooters.ROUTES.documents.createDraftUpload,
      v1.scooters.scooterDocumentUploadSchema,
      expect.objectContaining({
        json: expect.objectContaining({ byteSize: 12 * 1024 * 1024 }),
      }),
    );
    expect(mocks.put).toHaveBeenCalledWith(
      "https://s3.example.com/upload",
      expect.objectContaining({ method: "PUT", body: file }),
    );
  });

  it.each([
    [
      new ApiError(413, "too large", "FILE_TOO_LARGE", {
        maxBytes: 10 * 1024 * 1024,
      }),
      "The server accepts files up to 10 MB.",
    ],
    [
      new ApiError(413, "too large"),
      "The server rejected this file because it exceeds its upload limit.",
    ],
    [
      new ApiError(503, "private storage details", "IMAGE_STORAGE_UNAVAILABLE"),
      "File storage is temporarily unavailable.",
    ],
    [new TypeError("Failed to fetch"), "The upload connection failed."],
  ])(
    "shows actionable upload errors instead of the generic failure: %s",
    async (error, message) => {
      mocks.api.mockRejectedValueOnce(error);
      const browser = userEvent.setup();
      renderWithMessages(<Harness initial={[]} />);
      await browser.upload(
        screen.getByLabelText("Add Vehicle identity card (CIV)", {
          selector: "input",
        }),
        pdf(),
      );
      await browser.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Save",
        }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(screen.getByRole("button", { name: "Save test" })).toBeDisabled();
      expect(mocks.put).not.toHaveBeenCalled();
    },
  );

  it("checks the server's returned upload limit before sending file bytes to S3", async () => {
    mocks.api.mockResolvedValueOnce({
      uploadUrl: "https://s3.example.com/upload",
      uploadToken: "token",
      method: "PUT",
      headers: {},
      maxBytes: 10 * 1024 * 1024,
    });
    const browser = userEvent.setup();
    renderWithMessages(<Harness initial={[]} />);
    const file = pdf();
    Object.defineProperty(file, "size", { value: 12 * 1024 * 1024 });
    await browser.upload(
      screen.getByLabelText("Add Vehicle identity card (CIV)", {
        selector: "input",
      }),
      file,
    );
    await browser.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The server accepts files up to 10 MB.",
    );
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it.each([
    ["queued", "Waiting to analyze…"],
    ["validating", "Preparing document…"],
    ["running", "Analyzing document…"],
  ] as const)("announces %s in the grouped upload preview", (phase, label) => {
    renderWithMessages(
      <ScooterDocumentAnalysisContext
        value={{ doc: { status: "processing", phase } }}
      >
        <Harness />
      </ScooterDocumentAnalysisContext>,
    );
    expect(
      within(screen.getByRole("button", { name: "Preview old.pdf" })).getByText(
        label,
      ),
    ).toHaveClass("sr-only");
  });

  it("shows restart guidance for closed sessions without an upload retry loop", async () => {
    mocks.api.mockRejectedValueOnce(
      new ApiError(400, "closed", "DOCUMENT_EDITOR_SESSION_UNAVAILABLE"),
    );
    const browser = userEvent.setup();
    renderWithMessages(<Harness initial={[]} />);
    await browser.upload(
      screen.getByLabelText("Add Vehicle identity card (CIV)", {
        selector: "input",
      }),
      pdf(),
    );
    await browser.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      messages.en.scooters.documents.sessionExpired,
    );
    expect(
      screen.queryByRole("button", { name: "Retry upload" }),
    ).not.toBeInTheDocument();
    expect(mocks.put).not.toHaveBeenCalled();
  });

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
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
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
    expect(await screen.findByText(/Upload failed/)).toBeInTheDocument();
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
      "Unsupported format",
    );
    const file = pdf();
    Object.defineProperty(file, "size", { value: 20_000_000 });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The file is too large. Maximum size: 15 MB.",
    );
    expect(mocks.api).not.toHaveBeenCalled();
  });
});
