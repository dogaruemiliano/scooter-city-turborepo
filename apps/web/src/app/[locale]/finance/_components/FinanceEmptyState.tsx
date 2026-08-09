import type { ReactNode } from "react";

export function FinanceEmptyState({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
