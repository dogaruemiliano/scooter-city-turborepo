import type { SupportedLocale } from "@repo/i18n";

const NUMBER_FORMAT_LOCALES = {
  en: "en-GB",
  ro: "ro-RO",
} as const satisfies Record<SupportedLocale, string>;

const MONEY_PATTERN = /^(-?)(0|[1-9]\d*)(?:\.(\d{1,2}))?$/;

export function formatMoney(
  amount: string,
  currency: string,
  locale: SupportedLocale,
): string {
  const match = MONEY_PATTERN.exec(amount);

  if (!match) {
    return `${amount} ${currency}`;
  }

  const isNegative = match[1] === "-";
  const integer = BigInt(match[2]);
  const fraction = (match[3] ?? "").padEnd(2, "0");
  const formatter = new Intl.NumberFormat(NUMBER_FORMAT_LOCALES[locale], {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const formattedInteger =
    isNegative && integer !== BigInt(0) ? -integer : integer;
  const parts = formatter
    .formatToParts(formattedInteger)
    .map((part) =>
      part.type === "fraction" ? { ...part, value: fraction } : part,
    );

  if (isNegative && integer === BigInt(0)) {
    const negativeParts = formatter.formatToParts(BigInt(-1));
    const minusIndex = negativeParts.findIndex(
      (part) => part.type === "minusSign",
    );
    const minusSign =
      negativeParts.find((part) => part.type === "minusSign")?.value ?? "-";
    const insertionIndex = Math.max(0, Math.min(minusIndex, parts.length));
    parts.splice(insertionIndex, 0, {
      type: "minusSign",
      value: minusSign,
    });
  }

  return parts.map((part) => part.value).join("");
}

export function formatFinanceDateTime(
  value: string,
  locale: SupportedLocale,
): string {
  return new Intl.DateTimeFormat(NUMBER_FORMAT_LOCALES[locale], {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function financeUserLabel(user: {
  email: string;
  firstName: string | null;
  lastName: string | null;
}): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email;
}
