import type { Meta, StoryObj } from "@storybook/react-vite";
import { useCallback, useState } from "react";
import { PdfPreview } from "./pdf-preview";

const meta = {
  title: "Media/PdfPreview",
  component: PdfPreview,
  tags: ["autodocs"],
  args: {
    src: new URL("../stories/fixtures/sample-two-pages.pdf", import.meta.url)
      .href,
    label: "Demonstration document",
    labels: {
      error: "Could not load the document",
      previousPage: "Previous page",
      nextPage: "Next page",
    },
  },
} satisfies Meta<typeof PdfPreview>;
export default meta;
type Story = StoryObj<typeof meta>;

function ReviewProgress(args: React.ComponentProps<typeof PdfPreview>) {
  const [text, setText] = useState("");
  const [end, setEnd] = useState(false);
  const rendered = useCallback(
    (page: number, total: number, pageText: string) => {
      setText(pageText);
      if (page === total) setEnd(true);
    },
    [],
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-96 flex-col">
        <PdfPreview {...args} showCaption={false} onPageRendered={rendered} />
      </div>
      <p role="status">
        {end ? "Document end reached" : "Navigate to the document end"}
      </p>
      <p className="whitespace-pre-wrap text-sm">{text}</p>
    </div>
  );
}

/** Review telemetry is caller owned and does not imply that someone read the document. */
export const PageReview: Story = { render: ReviewProgress };
