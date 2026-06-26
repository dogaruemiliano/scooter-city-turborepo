"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { supportedLocales, type SupportedLocale } from "@repo/i18n";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components";
import { useLocale, useTranslations } from "next-intl";

import { getUnprefixedPathname, resolveRouteLocale } from "../i18n/paths";
import { Link, useRouter } from "../i18n/navigation";

interface LanguageSwitcherProps {
  className?: string;
}

const localeFlags = {
  ro: "🇷🇴",
  en: "🇬🇧",
} as const satisfies Record<SupportedLocale, string>;

export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const t = useTranslations("language");
  const router = useRouter();
  const options = useLanguageOptions();
  const current = options.find((option) => option.current) ?? options[0]!;

  function handleLocaleChange(locale: string | null) {
    const option = options.find((item) => item.locale === locale);

    if (!option || option.current) {
      return;
    }

    router.replace(option.href, { locale: option.locale });
  }

  return (
    <nav
      aria-label={t("label")}
      className={["flex justify-center", className].filter(Boolean).join(" ")}
    >
      <Select value={current.locale} onValueChange={handleLocaleChange}>
        <SelectTrigger aria-label={t("label")}>
          <SelectValue>
            <LanguageOptionContent option={current} />
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              key={option.locale}
              value={option.locale}
              aria-label={option.label}
            >
              <LanguageOptionContent option={option} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </nav>
  );
}

type LanguageOption = ReturnType<typeof useLanguageOptions>[number];

function LanguageOptionContent({ option }: { option: LanguageOption }) {
  return (
    <>
      <span aria-hidden="true">{localeFlags[option.locale]}</span>
      <span>{option.label}</span>
    </>
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
