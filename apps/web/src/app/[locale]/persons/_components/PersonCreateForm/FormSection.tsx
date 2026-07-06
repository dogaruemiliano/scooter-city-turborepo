import type { ReactNode } from "react";

export function FormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="grid min-w-0 gap-4 rounded-lg bg-muted p-4">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}
