import { renderOtpEmail } from "./otp-email";

describe("OTP email", () => {
  it.each(["en", "ro"] as const)(
    "renders localized multipart content in %s",
    (locale) => {
      const email = renderOtpEmail({
        code: "012345",
        locale,
        validForMinutes: 15,
      });
      expect(email.subject).toContain("012345");
      expect(email.subject).toContain("Scooter City");
      expect(email.text).toContain("012345");
      expect(email.text).toContain("15");
      expect(email.html).toContain(`lang="${locale}"`);
      expect(email.html).toContain(">012345</td>");
      expect(email.html).not.toMatch(
        /oklch\(|var\(--|<img|<script|\{code\}|\{minutes\}/,
      );
      expect(email.text).toContain(
        locale === "ro" ? "Nu divulga" : "Never share",
      );
    },
  );

  it("anchors expiry to the original request and respects configured lifetimes", () => {
    const email = renderOtpEmail({
      code: "012345",
      locale: "en",
      validForMinutes: 10,
    });
    const expiry = "This code expires 10 minutes after your original request.";
    expect(email.text).toContain(expiry);
    expect(email.html).toContain(expiry);
    expect(email.text).not.toContain("Time remaining");
  });

  it("escapes interpolated HTML and preserves the plain-text value", () => {
    const email = renderOtpEmail({
      code: "<b>&",
      locale: "en",
      validForMinutes: 15,
    });
    expect(email.html).toContain("&lt;b&gt;&amp;");
    expect(email.html).not.toContain("<b>");
    expect(email.text).toContain("<b>&");
  });
});
