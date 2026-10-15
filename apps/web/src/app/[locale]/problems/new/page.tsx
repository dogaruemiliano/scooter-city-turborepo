import { messages } from "@repo/i18n";
import type { Metadata } from "next";
import { resolveRouteLocale } from "@/i18n/paths";
import { requireAccess } from "@/lib/access-server";
import { ProblemCreateScreen } from "../_components/ProblemCreateScreen";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ scooterId?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return { title: messages[resolveRouteLocale(locale)].workspace.problems.add };
}

export default async function Page({ params, searchParams }: Props) {
  const { locale } = await params;
  const query = await searchParams;
  await requireAccess(
    resolveRouteLocale(locale),
    "/problems/new",
    "problems.create",
  );
  return (
    <ProblemCreateScreen
      scooterId={
        typeof query.scooterId === "string" ? query.scooterId : undefined
      }
    />
  );
}
