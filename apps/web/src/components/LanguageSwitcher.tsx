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
  ro: "/icons/flag-romania.svg",
  en: "/icons/flag-uk.svg",
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
        <SelectTrigger
          aria-label={t("label")}
          className="w-auto border-0 bg-transparent"
        >
          <SelectValue>
            <LanguageFlag locale={current.locale} />
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
      <LanguageFlag locale={option.locale} />
      <span>{option.label}</span>
    </>
  );
}

function LanguageFlag({ locale }: { locale: SupportedLocale }) {
  return (
    // Local SVG flags avoid platform-dependent emoji rendering.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={localeFlags[locale]}
      alt=""
      className="h-4 w-6 shrink-0 rounded-xs object-cover"
    />
  );
}

export function LanguageMenuSub() {
  const t = useTranslations("language");
  const options = useLanguageOptions();
  const current = options.find((option) => option.current) ?? options[0]!;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger openOnHover={false}>
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
  const unprefixedPath = `${getUnprefixedPathname(pathname)}${queryString}`;

  return supportedLocales.map((locale: SupportedLocale) => {
    const label = t(`locales.${locale}`);

    return {
      locale,
      label,
      href: unprefixedPath,
      linkLocale: locale,
      current: locale === currentLocale,
      ariaLabel:
        locale === currentLocale
          ? t("current")
          : t("switchTo", { language: label }),
    };
  });
}
