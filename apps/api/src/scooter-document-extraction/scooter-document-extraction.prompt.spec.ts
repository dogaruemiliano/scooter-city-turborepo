import { scooterDocumentExtractionPrompt } from "./scooter-document-extraction.prompt";

describe("selective scooter document extraction prompt", () => {
  it.each(["registration_certificate", "itp_card", "unclassified"] as const)(
    "classifies %s in the same request without requesting excluded contents",
    (type) => {
      const prompt = scooterDocumentExtractionPrompt(type);
      expect(prompt).toContain(
        "Only civ, insurance and itp_certificate permit data extraction",
      );
      expect(prompt).toContain(
        "Return vin=null, fields=[], rawFields=[] and inspections=[]",
      );
      expect(prompt).toContain(
        "Registration details are entered manually by the user",
      );
      expect(prompt).toContain(
        "independently to each logical document in mixed PDFs",
      );
      expect(prompt).toContain("Set clientCopy=true only");
      expect(prompt).not.toContain(
        "Read the yellow ITP card as an inspection history",
      );
      expect(prompt).not.toContain("Prioritize finding registrationNumber");
    },
  );
});
