import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";

import { Button } from "@repo/ui/components/button";
import {
  ImageCapture,
  type ImageCaptureProps,
} from "@repo/ui/components/image-capture";

const meta = {
  title: "Media/ImageCapture",
  component: ImageCapture,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Fullscreen capture and preview with optional gallery/files. When allowCrop is enabled, a separate ImageEditor opens for cropping, straightening, and vertical/horizontal perspective adjustments. Canceling the editor returns to preview without saving edits. Pass allowGallery={false} for live photos only, and allowCrop={false} to preserve the captured image. onCapture receives the confirmed File; reject the promise to keep the editor or preview open for retry. Camera access requires HTTPS or localhost. Labels are supplied by the caller for localization.",
      },
    },
  },
  args: {
    open: false,
    onOpenChange: () => {},
    onCapture: () => {},
    allowGallery: true,
    allowCrop: true,
  },
} satisfies Meta<typeof ImageCapture>;
export default meta;
type Story = StoryObj<typeof meta>;

function CaptureExample(props: Partial<ImageCaptureProps>) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string>();
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  return (
    <div className="flex flex-col items-start gap-4">
      <Button onClick={() => setOpen(true)}>Add photo</Button>
      {preview ? (
        <img
          src={preview}
          alt="Confirmed capture"
          className="max-h-64 max-w-full rounded-lg object-contain"
        />
      ) : null}
      <ImageCapture
        {...props}
        open={open}
        onOpenChange={setOpen}
        onCapture={(file) => setPreview(URL.createObjectURL(file))}
      />
    </div>
  );
}

export const CameraAndFiles: Story = {
  render: (args) => <CaptureExample {...args} />,
};
export const LivePhotoOnly: Story = {
  args: { allowGallery: false, allowCrop: false },
  render: (args) => <CaptureExample {...args} />,
};
export const CropLivePhoto: Story = {
  args: { allowGallery: false, allowCrop: true },
  render: (args) => <CaptureExample {...args} />,
};

export const IdentityCard: Story = {
  args: { captureMode: "identity-card", allowCrop: true },
  render: (args) => <CaptureExample {...args} />,
};
