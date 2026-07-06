import type { Metadata } from "next";
import { Geist_Mono, Manrope } from "next/font/google";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { isSupportedLocale, supportedLocales } from "@repo/i18n";
import { TooltipProvider } from "@repo/ui/components/tooltip";
import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";

import { AppShell } from "../../components/AppShell";
import { SessionProvider } from "../../components/auth/SessionProvider";
import { meFromApi } from "../../lib/auth-server";
import {
  resolveDataTheme,
  resolveThemePreference,
  THEME_COOKIE_NAME,
} from "../../lib/theme-cookie";
import "../globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DecTech",
  description: "Web workspace",
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

  const [cookieStore, initialUser] = await Promise.all([
    cookies(),
    meFromApi(),
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
      <body className="relative min-h-full">
        <div className="isolate flex min-h-full flex-col">
          <NextIntlClientProvider>
            <TooltipProvider>
              <SessionProvider initialUser={initialUser}>
                <AppShell initialThemePreference={initialThemePreference}>
                  {children}
                </AppShell>
              </SessionProvider>
            </TooltipProvider>
          </NextIntlClientProvider>
        </div>
      </body>
    </html>
  );
}
