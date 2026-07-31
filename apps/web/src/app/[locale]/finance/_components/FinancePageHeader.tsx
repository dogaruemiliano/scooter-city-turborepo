import type { ReactNode } from "react";

interface FinancePageHeaderProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function FinancePageHeader({
  title,
  description,
  action,
}: FinancePageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
