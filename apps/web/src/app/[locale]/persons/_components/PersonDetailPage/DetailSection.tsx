import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components";

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
    <DetailSectionCard title={title} icon={icon}>
      <dl className="grid min-w-0 gap-4 sm:grid-cols-2">{children}</dl>
    </DetailSectionCard>
  );
}

export function DetailSectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0">
      <Card className="grid md:grid-cols-3 md:gap-6">
        <CardHeader className="flex md:col-span-1">
          <CardTitle className="flex items-center gap-2">
            {icon}
            <h2>{title}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="min-w-0 md:col-span-2">{children}</CardContent>
      </Card>
    </section>
  );
}
