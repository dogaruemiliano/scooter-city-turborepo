import type { ReactNode } from "react";

export default function CompanyLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-10">
      {children}
    </main>
  );
}
