import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Pencil, Plus } from "lucide-react";
import {
  ChecklistEditor,
  ChecklistList,
  type ChecklistItem,
} from "./checklist";
import { AddAction } from "./add-action";
import { Button } from "./button";

function Example() {
  const [items, setItems] = useState<ChecklistItem[]>([
    { id: "brakes", text: "Check brakes", completed: false },
    { id: "tires", text: "Inspect tires", completed: true },
    { id: "lights", text: "Test lights", completed: false },
  ]);
  const [editor, setEditor] = useState<"edit" | "add" | null>(null);
  return (
    <div className="mx-auto flex w-full max-w-(--breakpoint-md) flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Checklist</h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Edit checklist"
          onClick={() => setEditor("edit")}
        >
          <Pencil />
        </Button>
      </div>
      <ChecklistList
        items={items}
        emptyMessage="No items yet"
        onCheckedChange={(id, completed) =>
          setItems((current) =>
            current.map((item) =>
              item.id === id ? { ...item, completed } : item,
            ),
          )
        }
      />
      <AddAction
        text="Add item"
        icon={<Plus />}
        size="compact"
        onClick={() => setEditor("add")}
      />
      {editor ? (
        <ChecklistEditor
          items={items}
          initialAdding={editor === "add"}
          onClose={() => setEditor(null)}
          onSave={async (next) => {
            setItems(next);
            return true;
          }}
          labels={{
            title: "Edit checklist",
            description:
              "Add, reorder, or remove items, then save your changes.",
            instructions:
              "Long press an item to move it up or down. With a keyboard, press Space to pick up, Up or Down to move, then Space to drop or Escape to cancel. Press Enter in the new-item input to add it.",
            empty: "No items yet",
            add: "Add item",
            input: "New item",
            placeholder: "e.g. Check the brake pads",
            save: "Save checklist",
            cancel: "Cancel",
            remove: (text) => `Remove ${text}`,
            reorder: (text) => `Move ${text}`,
          }}
        />
      ) : null}
    </div>
  );
}
const meta = {
  title: "Forms/Checklist",
  component: Example,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
