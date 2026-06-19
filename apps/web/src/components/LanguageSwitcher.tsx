"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { supportedLocales, type SupportedLocale } from "@repo/i18n";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@repo/ui/components";
import { useLocale, useTranslations } from "next-intl";

import { getUnprefixedPathname, resolveRouteLocale } from "../i18n/paths";
import { Link } from "../i18n/navigation";

interface LanguageSwitcherProps {
  className?: string;
}

export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const t = useTranslations("language");
  const options = useLanguageOptions();

  return (
    <nav
      aria-label={t("label")}
      className={["flex items-center justify-center gap-2 text-sm", className]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="text-muted-foreground">{t("label")}</span>
      <div className="inline-flex items-center gap-1">
        {options.map((option) => (
          <Link
            key={option.locale}
            href={option.href}
            locale={option.linkLocale}
            aria-current={option.current ? "true" : undefined}
            aria-label={option.ariaLabel}
            className={
              option.current
                ? "font-medium text-foreground"
                : "text-link underline hover:text-link-hover"
            }
          >
            {option.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function LanguageMenuSub() {
  const t = useTranslations("language");
  const options = useLanguageOptions();
  const current = options.find((option) => option.current) ?? options[0]!;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        {t("label")}
        <span className="ml-auto text-muted-foreground">{current.label}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup value={current.locale}>
          {options.map((option) => (
            <DropdownMenuRadioItem
              key={option.locale}
              value={option.locale}
              render={
                <Link
                  href={option.href}
                  locale={option.linkLocale}
                  aria-label={option.ariaLabel}
                />
              }
            >
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function useLanguageOptions() {
  const t = useTranslations("language");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentLocale = resolveRouteLocale(useLocale());
  const query = searchParams.toString();
  const queryString = query ? `?${query}` : "";
  const visiblePath = `${pathname}${queryString}`;
  const unprefixedPath = `${getUnprefixedPathname(pathname)}${queryString}`;

  return supportedLocales.map((locale: SupportedLocale) => {
    const label = t(`locales.${locale}`);

    return {
      locale,
      label,
      href: locale === currentLocale ? visiblePath : unprefixedPath,
      linkLocale: locale === currentLocale ? undefined : locale,
      current: locale === currentLocale,
      ariaLabel:
        locale === currentLocale
          ? t("current")
          : t("switchTo", { language: label }),
    };
  });
}
