import { useState } from "react";
import {
  AttachmentPicker,
  type AttachmentPickerProps,
} from "@repo/ui/components/attachment-picker";
import {
  render,
  screen,
  waitFor,
  within,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAttachmentPicker } from "./useAttachmentPicker";

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:attachment");
  URL.revokeObjectURL = vi.fn();
});

function Harness({
  onConfirm = vi.fn(),
  maxFiles = 2,
  ...props
}: Partial<AttachmentPickerProps>) {
  const [open, setOpen] = useState(true);
  const picker = useAttachmentPicker();
  return (
    <>
      <button onClick={() => setOpen(true)}>Open picker</button>
      <AttachmentPicker
        {...picker}
        open={open}
        onOpenChange={setOpen}
        onConfirm={onConfirm}
        maxFiles={maxFiles}
        maxFileSize={1024}
        accept="image/jpeg,image/png,application/pdf"
        {...props}
      />
    </>
  );
}
function setup(props: Partial<AttachmentPickerProps> = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <Harness {...props} />
    </NextIntlClientProvider>,
  );
  return userEvent.setup();
}
const image = (name: string) =>
  new File(["image"], name, { type: "image/jpeg" });
function input(name: string) {
  return screen.getByLabelText(name, { selector: "input" });
}

describe("shared native attachment picker", () => {
  it("uses native back-camera capture and separate gallery/file inputs", () => {
    setup();
    expect(input("Take photo")).toHaveAttribute("capture", "environment");
    expect(input("Take photo")).not.toHaveAttribute("multiple");
    expect(input("Choose from gallery")).toHaveAttribute("multiple");
    expect(input("Choose from files")).toHaveAttribute(
      "accept",
      "image/jpeg,image/png,application/pdf",
    );
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    const sheet = screen.getByRole("dialog");
    expect(sheet).toHaveClass("bg-popover", "text-popover-foreground");
    expect(sheet.querySelector(".bg-background")).toBeNull();
  });

  it("collects repeated native captures and submits both in the selected order", async () => {
    const confirm = vi.fn();
    const user = setup({ onConfirm: confirm });
    const first = image("first.jpg"),
      second = image("second.jpg");
    await user.upload(input("Take photo"), first);
    await user.upload(input("Take photo"), second);
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByText("2 of 2 files selected")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add more" })).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Move earlier: second.jpg" }),
    );
    await user.click(screen.getByRole("button", { name: "Use 2 files" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith([second, first]));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("replaces one attachment through the source chooser and allows removal", async () => {
    const confirm = vi.fn();
    const user = setup({ onConfirm: confirm });
    const first = image("first.jpg"),
      second = image("second.jpg"),
      replacement = image("replacement.jpg");
    await user.upload(input("Choose from gallery"), [first, second]);
    await user.click(
      screen.getByRole("button", { name: "Replace: first.jpg" }),
    );
    await user.click(screen.getByRole("button", { name: "Take photo" }));
    await user.upload(input("Take photo"), replacement);
    expect(screen.queryByText("first.jpg")).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Remove: second.jpg" }),
    );
    await user.click(screen.getByRole("button", { name: "Use file" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith([replacement]));
  });

  it("discards provisional files on close and starts fresh on reopening", async () => {
    const confirm = vi.fn();
    const user = setup({ onConfirm: confirm });
    await user.upload(input("Take photo"), image("first.jpg"));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Close",
      }),
    );
    expect(confirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Open picker" }));
    expect(screen.queryByText("first.jpg")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("keeps files and the original action after a failed confirmation", async () => {
    const confirm = vi
      .fn()
      .mockRejectedValueOnce(new Error("Upload failed"))
      .mockResolvedValueOnce(undefined);
    const user = setup({ onConfirm: confirm });
    await user.upload(input("Take photo"), image("first.jpg"));
    await user.click(screen.getByRole("button", { name: "Use file" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Upload failed");
    expect(screen.getByRole("button", { name: "Use file" })).toBeEnabled();
    expect(screen.getByText("first.jpg")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use file" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("blocks duplicate confirmation while pending", async () => {
    let finish!: () => void;
    const confirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const user = setup({ onConfirm: confirm });
    await user.upload(input("Take photo"), image("first.jpg"));
    await user.click(screen.getByRole("button", { name: "Use file" }));
    const pending = screen.getByRole("button", { name: /Preparing files/ });
    expect(pending).toBeDisabled();
    fireEvent.click(pending);
    expect(confirm).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("enforces file count, type, and size before accepting a selection", async () => {
    setup();
    fireEvent.change(input("Choose from files"), {
      target: { files: [image("1.jpg"), image("2.jpg"), image("3.jpg")] },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("up to 2");
    fireEvent.change(input("Choose from files"), {
      target: {
        files: [new File(["text"], "bad.txt", { type: "text/plain" })],
      },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("not supported");
    fireEvent.change(input("Take photo"), {
      target: {
        files: [
          new File([new Uint8Array(1025)], "big.jpg", { type: "image/jpeg" }),
        ],
      },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("too large");
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("accepts PDFs from files and limits a person-document slot to one file", async () => {
    const confirm = vi.fn();
    const user = setup({ maxFiles: 1, onConfirm: confirm });
    expect(input("Choose from files")).not.toHaveAttribute("multiple");
    const pdf = new File(["pdf"], "identity.pdf", { type: "application/pdf" });
    await user.upload(input("Choose from files"), pdf);
    await user.click(screen.getByRole("button", { name: "Use file" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith([pdf]));
  });

  it("provides an optional secondary action without starting confirmation", async () => {
    const manual = vi.fn(),
      confirm = vi.fn();
    const user = setup({
      onConfirm: confirm,
      secondaryAction: { label: "Add expense manually", onClick: manual },
    });
    await user.click(
      screen.getByRole("button", { name: "Add expense manually" }),
    );
    expect(manual).toHaveBeenCalledOnce();
    expect(confirm).not.toHaveBeenCalled();
  });
});
