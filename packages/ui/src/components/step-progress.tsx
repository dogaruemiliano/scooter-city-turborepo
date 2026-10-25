"use client";

import { cn } from "@repo/ui/lib/utils";

export type StepProgressProps = {
  labels: readonly string[];
  activeIndex: number;
  label: string;
  /** Fractional gesture position; accessible progress remains committed. */
  visualIndex?: number;
  tracking?: boolean;
  disabled?: boolean;
  onStepSelect?: (index: number) => void;
  canSelectStep?: (index: number) => boolean;
};

/** Segmented step progress with optional, caller-authorized navigation. */
export function StepProgress({
  labels,
  activeIndex,
  label,
  visualIndex = activeIndex,
  tracking = false,
  disabled = false,
  onStepSelect,
  canSelectStep,
}: StepProgressProps) {
  return (
    <div data-slot="step-progress" className="w-full">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={1}
        aria-valuemax={labels.length}
        aria-valuenow={activeIndex + 1}
        aria-valuetext={labels[activeIndex]}
        className="sr-only"
      />
      <ol aria-label={label} className="flex gap-1">
        {labels.map((step, index) => {
          const content = (
            <>
              <span
                aria-hidden="true"
                className="relative h-0.5 w-full overflow-hidden rounded-full bg-border-strong group-disabled:bg-disabled"
              >
                <span
                  data-slot="step-progress-fill"
                  className="absolute inset-0 origin-left bg-primary group-disabled:bg-disabled transition-transform duration-normal ease-decelerate motion-reduce:transition-none rtl:origin-right"
                  style={{
                    transform: `scaleX(${Math.max(0, Math.min(1, visualIndex + 1 - index))})`,
                    transitionProperty: tracking ? "none" : undefined,
                  }}
                />
              </span>
              <span className="sr-only">{step}</span>
            </>
          );
          const itemClassName = "flex h-6 w-full items-start rounded-sm";
          return (
            <li
              key={`${index}-${step}`}
              aria-current={index === activeIndex ? "step" : undefined}
              data-state={
                index < activeIndex
                  ? "complete"
                  : index === activeIndex
                    ? "current"
                    : "pending"
              }
              className="min-w-0 flex-1"
            >
              {onStepSelect && canSelectStep?.(index) ? (
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={step}
                  onClick={() => onStepSelect(index)}
                  className={cn(
                    itemClassName,
                    "group outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:bg-transparent",
                  )}
                >
                  {content}
                </button>
              ) : (
                <span className={itemClassName}>{content}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
