import type { Metadata, Viewport } from "next";
import { Geist_Mono, Manrope } from "next/font/google";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { isSupportedLocale, supportedLocales } from "@repo/i18n";
import { TooltipProvider } from "@repo/ui/components/tooltip";
import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";

import { WorkspaceNotifications } from "../../components/WorkspaceNotifications";
import { AppShell } from "../../components/AppShell";
import { SessionProvider } from "../../components/auth/SessionProvider";
import { meFromApi } from "../../lib/auth-server";
import { pwaMetadata } from "../../lib/pwa";
import {
  resolveDataTheme,
  resolveThemePreference,
  THEME_COOKIE_NAME,
} from "../../lib/theme-cookie";
import "../globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  return {
    ...pwaMetadata(
      resolveThemePreference(cookieStore.get(THEME_COOKIE_NAME)?.value),
    ),
    title: "ScooterCity",
    description: "Web workspace",
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const signingRoute = (await headers()).get("x-scooter-route") === "/signing";
  const [cookieStore, initialUser] = await Promise.all([
    cookies(),
    signingRoute ? Promise.resolve(null) : meFromApi(),
  ]);
  const themeCookie = cookieStore.get(THEME_COOKIE_NAME)?.value;
  const dataTheme = resolveDataTheme(themeCookie);
  const initialThemePreference = resolveThemePreference(themeCookie);

  return (
    <html
      lang={locale}
      data-theme={dataTheme}
      className={`${manrope.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body suppressHydrationWarning className="relative min-h-full">
        <div className="isolate flex min-h-full flex-col">
          <NextIntlClientProvider>
            <WorkspaceNotifications>
              <TooltipProvider>
                <SessionProvider initialUser={initialUser}>
                  <AppShell initialThemePreference={initialThemePreference}>
                    {children}
                  </AppShell>
                </SessionProvider>
              </TooltipProvider>
            </WorkspaceNotifications>
          </NextIntlClientProvider>
        </div>
      </body>
    </html>
  );
}
