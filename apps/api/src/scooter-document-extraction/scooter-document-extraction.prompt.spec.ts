import { scooterDocumentExtractionPrompt } from "./scooter-document-extraction.prompt";

describe("registration document extraction prompt", () => {
  it.each(["registration_certificate", "unclassified"] as const)(
    "guides %s extraction to the plate rather than the certificate serial",
    (type) => {
      const prompt = scooterDocumentExtractionPrompt(type);
      expect(prompt).toContain('"VL" (Vâlcea county)');
      expect(prompt).toContain(
        '"BUJORENI" (local registration authority/locality)',
      );
      expect(prompt).toContain('"B" (București/Bucharest)');
      expect(prompt).toContain(
        '"B 123 ABC" belongs in registrationNumber, never registrationCertificateNumber',
      );
      expect(prompt).toContain(
        '"BUJORENI-VL-176/18" also belongs in registrationNumber',
      );
      expect(prompt).toContain("Do not extract the keywords alone as a plate");
    },
  );
});
