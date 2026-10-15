import { messages } from "@repo/i18n";
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
import { DocumentPhotoDraftCard } from "./DocumentPhotoDraftCard";
import type { PersonDocumentPhotoDraftUpload } from "./types";

const onSet = vi.fn();
const file = new File(["photo"], "id.png", { type: "image/png" });
function setup(
  upload?: PersonDocumentPhotoDraftUpload,
  acceptsPdf = true,
  disabled = false,
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <DocumentPhotoDraftCard
        inputId="front"
        documentKey="romanian-classic-national-id"
        slot="front"
        slotLabel="Front"
        upload={upload}
        disabled={disabled}
        onSetDocumentPhoto={onSet}
        acceptsPdf={acceptsPdf}
      />
    </NextIntlClientProvider>,
  );
}
function saved(status: "uploaded" | "failed" = "uploaded") {
  return {
    file,
    status,
    message: status === "failed" ? "Upload failed" : undefined,
  } as PersonDocumentPhotoDraftUpload;
}
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:document"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});

describe("person shared native document input", () => {
  it("opens the native input directly without a custom camera or chooser", async () => {
    setup();
    const input = screen.getByLabelText("Add Front photo", {
      selector: "input",
    });
    const click = vi.spyOn(input, "click");
    await userEvent.click(
      screen.getByRole("button", { name: "Add Front photo" }),
    );
    expect(click).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute(
      "accept",
      "image/jpeg,image/png,image/webp,application/pdf",
    );
  });
  it.each(["image/png", "application/pdf"])(
    "requires Save before adding a %s",
    async (type) => {
      setup();
      const selected = new File(["document"], "document", { type });
      await userEvent.upload(
        screen.getByLabelText("Add Front photo", { selector: "input" }),
        selected,
      );
      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveClass(
        "h-dvh",
        "bg-popover",
        "text-popover-foreground",
        "p-0",
      );
      expect(
        dialog.querySelector('[data-slot="document-viewer-body"]'),
      ).not.toHaveClass("bg-background");
      expect(onSet).not.toHaveBeenCalled();
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Save" }),
      );
      expect(onSet).toHaveBeenCalledWith(
        "romanian-classic-national-id",
        "front",
        selected,
      );
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
    },
  );
  it("discards a provisional selection when closed", async () => {
    setup();
    await userEvent.upload(
      screen.getByLabelText("Add Front photo", { selector: "input" }),
      file,
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSet).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:document");
  });
  it("keeps the original when a replacement is cancelled", async () => {
    setup(saved());
    await userEvent.click(
      screen.getByRole("button", { name: "Change Front photo" }),
    );
    const input = screen.getByLabelText("Change Front photo", {
      selector: "input",
    });
    fireEvent.change(input, {
      target: { files: [new File(["new"], "new.png", { type: "image/png" })] },
    });
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSet).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("img", { name: "Front document photo" }),
    ).toBeInTheDocument();
  });
  it("viewing then saving an unchanged document does not re-upload", async () => {
    setup(saved());
    await userEvent.click(
      screen.getByRole("button", { name: "Change Front photo" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSet).not.toHaveBeenCalled();
  });
  it("validates dropped files and image-only slots before preview", async () => {
    const { container } = setup(undefined, false);
    fireEvent.drop(container.querySelector('[data-slot="document-input"]')!, {
      dataTransfer: {
        files: [new File(["pdf"], "id.pdf", { type: "application/pdf" })],
      },
    });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(onSet).not.toHaveBeenCalled();
  });
  it("retries failed uploads and can remove a saved document", async () => {
    setup(saved("failed"));
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onSet).toHaveBeenCalledWith(
      "romanian-classic-national-id",
      "front",
      file,
      undefined,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Change Front photo" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Document actions" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Remove Front photo" }),
    );
    expect(onSet).toHaveBeenLastCalledWith(
      "romanian-classic-national-id",
      "front",
      null,
    );
  });
  it("supports image zoom and reset without changing the saved file", async () => {
    setup(saved());
    await userEvent.click(
      screen.getByRole("button", { name: "Change Front photo" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    const viewport = screen
      .getByRole("dialog")
      .querySelector('[data-slot="document-zoom-viewport"]');
    expect(viewport).toHaveAttribute("data-zoom", "1.5");
    await userEvent.click(screen.getByRole("button", { name: "Reset zoom" }));
    expect(viewport).toHaveAttribute("data-zoom", "1");
    expect(onSet).not.toHaveBeenCalled();
  });
  it("ignores file drops while disabled", async () => {
    const { container } = setup(undefined, true, true);
    fireEvent.drop(container.querySelector('[data-slot="document-input"]')!, {
      dataTransfer: { files: [file] },
    });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(onSet).not.toHaveBeenCalled();
  });
});
