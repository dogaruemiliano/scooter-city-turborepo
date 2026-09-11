import type { ReactNode } from "react";

export default function FinanceLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-(--breakpoint-xl) flex-1 flex-col px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      {children}
    </main>
  );
}
