"use client";

import { useRef, useState, type DragEvent } from "react";

/** Tracks native file drags across nested children; ignores item-reordering drags. */
export function useFileDrop({
  disabled = false,
  onFiles,
}: {
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const depth = useRef(0);
  const [over, setOver] = useState(false);
  const reset = () => {
    depth.current = 0;
    setOver(false);
  };
  return {
    dragging: over && !disabled,
    handlers: {
      onDragEnter(event: DragEvent<HTMLElement>) {
        if (disabled || !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        depth.current += 1;
        setOver(true);
      },
      onDragOver(event: DragEvent<HTMLElement>) {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = disabled ? "none" : "copy";
        if (!disabled) {
          depth.current = Math.max(1, depth.current);
          setOver(true);
        }
      },
      onDragLeave() {
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) setOver(false);
      },
      onDrop(event: DragEvent<HTMLElement>) {
        const files = Array.from(event.dataTransfer.files);
        if (!files.length) {
          reset();
          return;
        }
        event.preventDefault();
        reset();
        if (!disabled) onFiles(files);
      },
    },
  };
}
