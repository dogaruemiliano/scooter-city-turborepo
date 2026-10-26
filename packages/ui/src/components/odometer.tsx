import { cn } from "@repo/ui/lib/utils";

interface OdometerProps {
  value: number | null;
  label?: string;
  /** Localized, unpadded reading including its unit, for assistive technology. */
  readingLabel: string;
  className?: string;
}

/** Mechanical-style mileage display. Unknown readings never imply zero. */
export function Odometer({
  value,
  label,
  readingLabel,
  className,
}: OdometerProps) {
  const digits = value == null ? null : String(value);

  return (
    <div className={cn("flex min-w-0 flex-col items-end gap-2", className)}>
      {label ? (
        <span className="text-right text-xs font-medium text-muted-foreground">
          {label}
        </span>
      ) : null}
      <div role="img" aria-label={readingLabel} className="max-w-full">
        <div aria-hidden="true" className="flex items-center">
          <span className="flex min-w-0 overflow-hidden rounded-sm border border-odometer-border bg-odometer-digit font-mono text-lg font-semibold leading-snug text-odometer-foreground tabular-nums sm:text-xl">
            {digits ? (
              Array.from(digits, (digit, index) => (
                <span
                  key={index}
                  className="relative flex w-5 min-w-0 items-center justify-center border-r border-odometer-border bg-odometer-digit py-1 sm:w-6"
                >
                  <span className="relative z-raised">{digit}</span>
                  <span
                    className="pointer-events-none absolute inset-0 flex items-center"
                    aria-hidden="true"
                  >
                    <span className="w-full border-t border-odometer-border" />
                  </span>
                </span>
              ))
            ) : (
              <span className="border-r border-odometer-border px-4 py-1">
                —
              </span>
            )}
            <span className="relative flex w-8 shrink-0 items-center justify-center self-stretch bg-odometer py-1 text-xs text-odometer-foreground">
              <span className="relative z-raised">km</span>
              <span className="pointer-events-none absolute inset-0 flex items-center">
                <span className="w-full border-t border-odometer-border" />
              </span>
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
