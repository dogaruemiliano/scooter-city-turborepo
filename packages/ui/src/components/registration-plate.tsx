import { cn } from "@repo/ui/lib/utils";

export interface RegistrationPlateProps {
  number: string;
  variant: "local" | "national" | "temporary";
  /** Localized description including registration type and the full number. */
  readingLabel: string;
  className?: string;
}

function CountryStrip() {
  return (
    <span className="flex w-5 shrink-0 flex-col items-center justify-center gap-1 self-stretch bg-plate-country text-plate-country-foreground">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-4 fill-plate-stars"
      >
        {Array.from({ length: 12 }, (_, index) => {
          const angle = (index * Math.PI) / 6;
          return (
            <path
              key={index}
              d="M0-1.6 .4-.5 1.6-.5 .6.3 1 1.5 0 .8-1 1.5-.6.3-1.6-.5-.4-.5Z"
              transform={`translate(${12 + 8 * Math.sin(angle)} ${12 - 8 * Math.cos(angle)})`}
            />
          );
        })}
      </svg>
      <span className="text-xs font-semibold leading-tight">RO</span>
    </span>
  );
}

/** Compact Romanian plate: local/national groups stack, provisional numbers stay together. */
export function RegistrationPlate({
  number,
  variant,
  readingLabel,
  className,
}: RegistrationPlateProps) {
  const value = number.trim();
  if (!value) return null;
  const parts = value.split(/[\s-]+/u).filter(Boolean);
  const splitAt = parts.length >= 3 ? 2 : 1;
  const stacked = variant !== "temporary" && parts.length > 1;

  return (
    <span
      role="img"
      aria-label={readingLabel}
      data-slot="registration-plate"
      data-variant={variant}
      className={cn(
        "inline-flex max-w-full overflow-hidden rounded-sm border border-plate-foreground text-plate-foreground",
        variant === "local" ? "bg-plate-local" : "bg-plate",
        variant === "temporary" && "text-plate-temporary",
        className,
      )}
    >
      <span aria-hidden="true" className="flex min-w-0">
        {variant !== "local" ? <CountryStrip /> : null}
        <span className="flex min-w-20 flex-col items-center justify-center px-2 py-1 font-mono text-lg font-bold leading-tight tabular-nums wrap-anywhere">
          <span data-slot="registration-plate-top">
            {stacked ? parts.slice(0, splitAt).join(" ") : value}
          </span>
          {stacked ? (
            <span data-slot="registration-plate-bottom">
              {parts.slice(splitAt).join(" ")}
            </span>
          ) : null}
        </span>
      </span>
    </span>
  );
}
