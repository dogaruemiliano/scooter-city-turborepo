import { PageLayout } from "@repo/ui/components/page-layout";
import type { ReactNode } from "react";

export default function CompanyLayout({ children }: { children: ReactNode }) {
  return <PageLayout>{children}</PageLayout>;
}
