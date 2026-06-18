import {
  defaultRouteLocale,
  localeCookieName,
  supportedLocales,
} from "@repo/i18n";
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: supportedLocales,
  defaultLocale: defaultRouteLocale,
  localePrefix: "as-needed",
  localeCookie: {
    name: localeCookieName,
  },
});
