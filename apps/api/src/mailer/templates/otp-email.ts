import { formatMessage, type SupportedLocale } from "@repo/i18n";
import { tokens } from "@repo/theme/email";

import type { MailerMessage } from "../mailer.service";

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });

/** Pure renderer: no SMTP, external images, or runtime CSS dependencies. */
export function renderOtpEmail({
  code,
  locale,
  validForMinutes,
}: {
  code: string;
  locale: SupportedLocale;
  validForMinutes: number;
}): Pick<MailerMessage, "subject" | "text" | "html"> {
  const heading = formatMessage(locale, "api.auth.otpEmailHeading");
  const intro = formatMessage(locale, "api.auth.otpEmailIntro");
  const preview = formatMessage(locale, "api.auth.otpEmailPreview");
  const expiry = formatMessage(locale, "api.auth.otpEmailExpiry", {
    minutes: validForMinutes,
  });
  const safety = formatMessage(locale, "api.auth.otpEmailSafety");
  const { color: c, spacing: s, typography: t, radius: r, sizing } = tokens;
  const px = (value: number) => `${value}px`;
  const paragraph = `margin:0 0 ${px(s[6])};`;

  return {
    subject: formatMessage(locale, "api.auth.otpEmailSubject", { code }),
    text: ["Scooter City", heading, intro, code, expiry, safety].join("\n\n"),
    html: `<!doctype html>
<html lang="${locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background-color:${c.background};color:${c.foreground};font-family:${t.fontFamily.sans.email};font-size:${px(t.fontSize.base)};line-height:${t.lineHeight.normal};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preview)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${c.background};"><tr><td align="center" style="padding:${px(s[8])} ${px(s[4])};">
<!--[if mso]><table role="presentation" width="${sizing.content}" align="center"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:${px(sizing.content)};background-color:${c.card};border-radius:${px(r.xl)};">
<tr><td style="padding:${px(s[6])};background-color:${c.primary};color:${c.primaryForeground};font-size:${px(t.fontSize.xl)};font-weight:${t.fontWeight.bold};border-radius:${px(r.xl)} ${px(r.xl)} 0 0;">Scooter City</td></tr>
<tr><td style="padding:${px(s[6])};">
<h1 style="${paragraph}font-size:${px(t.fontSize["2xl"])};line-height:${t.lineHeight.tight};font-weight:${t.fontWeight.bold};">${escapeHtml(heading)}</h1>
<p style="${paragraph}">${escapeHtml(intro)}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="padding:${px(s[6])} ${px(s[2])};background-color:${c.accent};color:${c.accentForeground};border-radius:${px(r.lg)};font-size:${px(t.fontSize["4xl"])};font-weight:${t.fontWeight.bold};line-height:${t.lineHeight.tight};">${escapeHtml(code)}</td></tr></table>
<p style="margin:${px(s[4])} 0 ${px(s[8])};font-size:${px(t.fontSize.sm)};color:${c.mutedForeground};">${escapeHtml(expiry)}</p>
<p style="margin:0;font-size:${px(t.fontSize.sm)};color:${c.mutedForeground};">${escapeHtml(safety)}</p>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`,
  };
}
