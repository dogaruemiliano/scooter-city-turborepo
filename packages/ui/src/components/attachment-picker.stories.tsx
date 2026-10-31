import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  AttachmentPicker,
  type AttachmentPickerProps,
} from "./attachment-picker";
import { Button } from "./button";

const labels = {
  title: "Add photos or files",
  close: "Close",
  takePhoto: "Take photo",
  gallery: "Choose from gallery",
  files: "Choose from files",
  addMore: "Add more",
  review: "Review selected files",
  replace: "Replace",
  remove: "Remove",
  preview: "Preview",
  moveEarlier: "Move earlier",
  moveLater: "Move later",
  empty: "Take a photo or choose a file to get started.",
  confirming: "Preparing files…",
  confirmed: "Files ready",
  invalidFile: "This file type is not supported.",
  fileTooLarge: "This file is too large.",
  tooManyFiles: (max: number) => `Add up to ${max} files.`,
  selectedCount: (count: number, max: number) =>
    `${count} of ${max} files selected`,
  confirm: (count: number) => (count ? `Use ${count} files` : "Continue"),
};
const viewerProps = {
  openFileLabel: "Open file",
  actionsLabel: "Media actions",
  cropLabel: "Crop image",
  pdfLabels: {
    error: "Preview unavailable",
    previousPage: "Previous page",
    nextPage: "Next page",
  },
  zoomLabels: {
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    resetZoom: "Reset zoom",
  },
};
const meta = {
  title: "Media/AttachmentPicker",
  component: AttachmentPicker,
  tags: ["autodocs"],
  args: {
    open: false,
    onOpenChange: () => {},
    onConfirm: () => {},
    maxFiles: 2,
    maxFileSize: 10 * 1024 * 1024,
    accept: "image/jpeg,image/png,image/webp,application/pdf",
    labels,
    viewerProps,
  },
} satisfies Meta<typeof AttachmentPicker>;
export default meta;
type Story = StoryObj<typeof meta>;
function Example(props: AttachmentPickerProps) {
  const [open, setOpen] = useState(false);
  const [names, setNames] = useState<string[]>([]);
  return (
    <div className="flex flex-col gap-4">
      <Button onClick={() => setOpen(true)}>Add attachments</Button>
      {names.length ? <p>{names.join(", ")}</p> : null}
      <AttachmentPicker
        {...props}
        open={open}
        onOpenChange={setOpen}
        onConfirm={(files) => setNames(files.map((file) => file.name))}
      />
    </div>
  );
}
export const TwoReceiptPhotos: Story = {
  render: (args) => <Example {...args} />,
};
export const SingleDocument: Story = {
  args: { maxFiles: 1 },
  render: (args) => <Example {...args} />,
};
export const IssuePhotos: Story = {
  args: { maxFiles: 10, accept: "image/jpeg,image/png,image/webp" },
  render: (args) => <Example {...args} />,
};
