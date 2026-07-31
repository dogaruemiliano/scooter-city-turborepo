import type { LucideIcon } from "lucide-react";

interface FinanceSelectorOptionRowProps {
  description?: string;
  icon?: LucideIcon;
  label: string;
}

/** Shared row presentation for wallet and counterparty selectors in Finance. */
export function FinanceSelectorOptionRow({
  description,
  icon: Icon,
  label,
}: FinanceSelectorOptionRowProps) {
  return (
    <>
      {Icon ? (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon aria-hidden="true" />
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{label}</span>
        {description ? (
          <span className="truncate text-xs text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
    </>
  );
}
