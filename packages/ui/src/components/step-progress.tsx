"use client";

/** Read-only document/task progress; upcoming steps cannot bypass validation. */
export function StepProgress({
  labels,
  activeIndex,
  label,
  visualIndex = activeIndex,
  tracking = false,
}: {
  labels: string[];
  activeIndex: number;
  label: string;
  /** Fractional position for a wizard gesture; accessible progress stays committed. */
  visualIndex?: number;
  /** Follow a gesture immediately instead of easing towards its latest position. */
  tracking?: boolean;
}) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={1}
      aria-valuemax={labels.length}
      aria-valuenow={activeIndex + 1}
      aria-valuetext={labels[activeIndex]}
      className="relative mx-auto w-full max-w-96"
    >
      {labels.length > 1 ? (
        <>
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-muted-foreground"
          />
          <div
            aria-hidden="true"
            data-slot="step-progress-fill"
            className="absolute inset-x-0 top-1/2 h-px origin-left -translate-y-1/2 bg-primary transition-transform duration-normal ease-decelerate motion-reduce:transition-none rtl:origin-right"
            style={{
              transform: `scaleX(${Math.max(0, Math.min(1, visualIndex / (labels.length - 1)))})`,
              transitionProperty: tracking ? "none" : undefined,
            }}
          />
        </>
      ) : null}
      <ol
        className={
          labels.length === 1
            ? "relative flex items-center justify-center"
            : "relative flex items-center justify-between"
        }
      >
        {labels.map((step, index) => (
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
            className="flex size-4 items-center justify-center"
          >
            <span
              className={
                index < activeIndex
                  ? "size-2.5 rounded-full border-2 border-primary bg-primary"
                  : index === activeIndex
                    ? "size-3 rounded-full border-2 border-primary bg-popover ring-2 ring-primary/20"
                    : "size-2.5 rounded-full border-2 border-muted-foreground bg-popover"
              }
            />
            <span className="sr-only">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
