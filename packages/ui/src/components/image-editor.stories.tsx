import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useRef, useState } from "react";
import { Button } from "@repo/ui/components/button";
import { ImageEditor } from "@repo/ui/components/image-editor";

const meta = {
  title: "Media/ImageEditor",
  component: ImageEditor,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Standalone fullscreen editor for an original image File. Crop, rotate by 90°, and adjust Z/X/Y independently using the ruler. onCancel discards the session; onSave receives the edited JPEG and original file. The caller unmounts the editor after saving. No camera or upload dependencies.",
      },
    },
  },
} satisfies Meta<typeof ImageEditor>;
export default meta;

function EditorExample() {
  const input = useRef<HTMLInputElement>(null);
  const [original, setOriginal] = useState<File>();
  const [result, setResult] = useState<File>();
  const [preview, setPreview] = useState<string>();
  useEffect(() => {
    if (!result) return;
    const url = URL.createObjectURL(result);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [result]);
  return (
    <div className="flex flex-col items-start gap-4">
      <Button onClick={() => input.current?.click()}>
        Choose an image to edit
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Choose image"
        className="hidden"
        onChange={(event) => {
          setOriginal(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {preview ? (
        <img
          src={preview}
          alt="Edited result"
          className="max-h-96 max-w-full object-contain"
        />
      ) : null}
      {original ? (
        <ImageEditor
          file={original}
          onCancel={() => setOriginal(undefined)}
          onSave={(file) => {
            setResult(file);
            setOriginal(undefined);
          }}
        />
      ) : null}
    </div>
  );
}

export const CropAndPerspective: StoryObj = { render: () => <EditorExample /> };
