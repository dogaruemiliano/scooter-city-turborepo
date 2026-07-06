import type { ReactNode } from "react";

export function DetailSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid min-w-0 gap-4 rounded-lg bg-muted p-4 md:grid-cols-3 md:gap-6">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-base font-semibold md:text-sm">{title}</h2>
      </div>
      <dl className="grid min-w-0 gap-4 sm:grid-cols-2 md:col-span-2">
        {children}
      </dl>
    </section>
  );
}
