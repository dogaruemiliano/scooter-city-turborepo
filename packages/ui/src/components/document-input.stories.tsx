import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { DocumentInput } from "./document-input";

const meta = {
  title: "Media/DocumentInput",
  component: DocumentInput,
  parameters: {
    docs: {
      description: {
        component:
          "Native file selection with explicit confirmation. Enable editOnSelect to immediately open the shared crop, rotation, and perspective editor for new images. Saving confirms the edited file directly; cancelling preserves the existing document. PDFs and existing-document viewing keep the normal preview.",
      },
    },
  },
} satisfies Meta<typeof DocumentInput>;
export default meta;

function EditOnSelectExample() {
  const [file, setFile] = useState<File>();
  return (
    <DocumentInput
      editOnSelect
      accept="image/jpeg,image/png,image/webp,application/pdf"
      value={
        file ? { file, fileName: file.name, contentType: file.type } : undefined
      }
      onConfirm={setFile}
      onRemove={() => setFile(undefined)}
      validate={(file) => (file.size ? null : "Choose a nonempty file")}
      labels={{
        label: "Document",
        add: "Add document photo",
        preview: "View document",
        title: "Document photo",
        imageAlt: "Document photo",
        close: "Cancel",
        change: "Replace photo",
        save: "Save photo",
        crop: "Edit photo",
        openFile: "Open file",
        actions: "Document actions",
        remove: "Remove",
        retry: "Retry",
        error: "Unable to display document",
        previousPage: "Previous page",
        nextPage: "Next page",
        zoomIn: "Zoom in",
        zoomOut: "Zoom out",
        resetZoom: "Reset zoom",
      }}
    />
  );
}

export const EditImmediatelyAfterSelection: StoryObj = {
  render: () => <EditOnSelectExample />,
};
