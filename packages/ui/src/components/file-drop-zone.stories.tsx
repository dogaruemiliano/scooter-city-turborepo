import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { FileDropZone } from "./file-drop-zone";

const meta = {
  title: "Forms/FileDropZone",
  component: FileDropZone,
  tags: ["autodocs"],
  args: {
    label: "Drop documents here",
    browseLabel: "Browse files",
    hint: "PDF or images. Upload limits are checked by the application.",
    accept: "application/pdf,image/*",
    onFiles: () => {},
  },
} satisfies Meta<typeof FileDropZone>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: function Example(args) {
    const [files, setFiles] = useState<File[]>([]);
    return (
      <div className="grid max-w-(--breakpoint-md) gap-4">
        <FileDropZone {...args} onFiles={setFiles} />
        <p role="status" className="text-sm text-muted-foreground">
          {files.map((file) => file.name).join(", ")}
        </p>
      </div>
    );
  },
};

export const Disabled: Story = { args: { disabled: true } };
