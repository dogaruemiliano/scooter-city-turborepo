import {
  defaultRouteLocale,
  isSupportedLocale,
  messages,
  type SupportedLocale,
} from "@repo/i18n";
import { getRequestConfig } from "next-intl/server";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: SupportedLocale = isSupportedLocale(requested)
    ? requested
    : defaultRouteLocale;

  return {
    locale,
    messages: messages[locale],
  };
});
