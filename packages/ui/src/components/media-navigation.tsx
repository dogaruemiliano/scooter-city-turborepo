"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "./button";

/** The same controls navigate either PDF pages or adjacent assets. */
export function MediaNavigation({
  previous,
  next,
  previousLabel,
  nextLabel,
  position,
}: {
  previous?: () => void;
  next?: () => void;
  previousLabel: string;
  nextLabel: string;
  position?: string;
}) {
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 min-h-11 hover:bg-document-overlay disabled:border-transparent disabled:bg-transparent"
        aria-label={previousLabel}
        disabled={!previous}
        onClick={previous}
      >
        <ChevronLeftIcon aria-hidden="true" />
      </Button>
      {position ? (
        <span
          role="status"
          className="whitespace-nowrap px-1 text-xs tabular-nums"
        >
          {position}
        </span>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 min-h-11 hover:bg-document-overlay disabled:border-transparent disabled:bg-transparent"
        aria-label={nextLabel}
        disabled={!next}
        onClick={next}
      >
        <ChevronRightIcon aria-hidden="true" />
      </Button>
    </>
  );
}
