/** A local calendar key keeps different days separate across cursor pages. */
export function notificationDateKey(value: string): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function notificationDateLabel(
  value: string,
  now: number,
  locale: string,
  labels: { today: string; yesterday: string },
): string {
  const date = new Date(value);
  const today = new Date(now);
  // Calendar arithmetic avoids DST making yesterday 23 or 25 hours long.
  const calendarDay = (day: Date) =>
    Date.UTC(day.getFullYear(), day.getMonth(), day.getDate());
  const age = (calendarDay(today) - calendarDay(date)) / 86_400_000;
  if (age === 0) return labels.today;
  if (age === 1) return labels.yesterday;
  if (age > 1 && age < 7) {
    const weekday = new Intl.DateTimeFormat(locale, { weekday: "long" }).format(
      date,
    );
    return weekday.charAt(0).toLocaleUpperCase(locale) + weekday.slice(1);
  }
  const shortDate = `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`;
  return date.getFullYear() === today.getFullYear()
    ? shortDate
    : `${shortDate}.${date.getFullYear()}`;
}

export function notificationRelativeTime(
  value: string,
  now: number,
  locale: string,
  justNow: string,
): string {
  const seconds = Math.max(0, (now - new Date(value).getTime()) / 1000);
  if (seconds < 60) return justNow;
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (seconds < 3600)
    return formatter.format(-Math.floor(seconds / 60), "minute");
  if (seconds < 86400)
    return formatter.format(-Math.floor(seconds / 3600), "hour");
  return formatter.format(-Math.floor(seconds / 86400), "day");
}
