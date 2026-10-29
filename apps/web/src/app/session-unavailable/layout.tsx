import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Manrope } from "next/font/google";
import { resolveDataTheme, THEME_COOKIE_NAME } from "../../lib/theme-cookie";
import "../globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ScooterCity",
  robots: { index: false, follow: false },
};

export default async function RecoveryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  return (
    <html
      data-theme={resolveDataTheme(cookieStore.get(THEME_COOKIE_NAME)?.value)}
      className={`${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
