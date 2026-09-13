import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { messages } from "@repo/i18n";
import { NextIntlClientProvider } from "next-intl";
import { expect, it, vi } from "vitest";
import { DocumentFormDialog } from "./DocumentFormDialog";

const upload = vi.hoisted(() => vi.fn());
vi.mock("../../_lib/upload-document-draft", () => ({
  uploadDocumentDraft: upload,
}));
vi.mock("../PersonCreateForm/DocumentPhotoDraftCard", () => ({
  DocumentPhotoDraftCard: ({
    slot,
    onSetDocumentPhoto,
  }: {
    slot: "front" | "back";
    onSetDocumentPhoto: (key: string, slot: string, file: File) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onSetDocumentPhoto(
          "driver-license",
          slot,
          new File([slot], `${slot}.png`, { type: "image/png" }),
        )
      }
    >
      Upload {slot}
    </button>
  ),
}));

it("requires both licence sides in the existing person's manual document dialog", async () => {
  upload.mockImplementation(async (file: File) => `${file.name}-token`);
  const onSubmit = vi.fn().mockResolvedValue(false);
  const user = userEvent.setup();
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <DocumentFormDialog
        title="Add licence"
        triggerLabel="Add licence"
        initialType="driverLicense"
        allowedTypes={["driverLicense"]}
        busy={false}
        onSubmit={onSubmit}
      />
    </NextIntlClientProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Add licence" }));
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveClass(
    "lg:w-document-editor",
    "lg:max-w-document-editor",
    "bg-popover",
    "text-popover-foreground",
  );
  for (const surface of dialog.querySelectorAll('[data-slot^="bottom-sheet-"]'))
    expect(surface).not.toHaveClass("bg-background");
  await user.type(within(dialog).getByLabelText("Number"), "LICENSE123");
  await user.click(
    within(dialog).getByRole("switch", { name: "Document has expiry date?" }),
  );
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  expect(onSubmit).not.toHaveBeenCalled();
  await user.click(
    within(dialog).getByRole("button", { name: "Upload front" }),
  );
  await waitFor(() =>
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled(),
  );
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  expect(onSubmit).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", { name: "Upload back" }));
  await waitFor(() =>
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled(),
  );
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "driverLicense",
        number: "LICENSE123",
        photos: { front: "front.png-token", back: "back.png-token" },
      }),
    ),
  );
});
