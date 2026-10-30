export const scooterItpMessages = {
  en: {
    documents: "ITP documents",
    update: "Update ITP",
    fromDocuments: "Review ITP documents",
    close: "Close",
    manualSource: "Source: manual entry",
    documentSource: "Source: reviewed documents",
    manualHint:
      "Enter the valid-until date, not a future inspection appointment. Leave the result unclear unless you can confirm it. Inspection date is optional for manual entry. Previous entries remain in history.",
    manualReviewed: "I checked the validity and result for this scooter.",
    calculatedFromCiv:
      "Calculated from the CIV issue date (initial two-year inspection).",
    title: "Technical inspections (ITP)",
    status: {
      missing: "ITP not recorded",
      review: "ITP needs review",
      active: "ITP valid",
      expiring: "ITP expires soon",
      expired: "ITP expired",
      failed: "Inspection failed",
    },
    renewal:
      "Upload an updated yellow card and the latest inspection certificate, then review the inspection below.",
    upload: "Upload inspection documents",
    add: "Record inspected documents",
    inspectionDate: "Inspection date",
    validUntil: "Valid until",
    result: "Inspection result",
    passed: "Passed",
    failed: "Failed",
    unknown: "Unclear — needs review",
    certificateNumber: "Certificate number",
    odometerKm: "Mileage at inspection (km)",
    card: "Yellow ITP card",
    certificate: "ITP certificate",
    choose: "Choose a document",
    reviewed:
      "I checked both scans, their vehicle identity and the inspection dates.",
    save: "Confirm inspection",
    saved: "Inspection recorded",
    loading: "Loading inspection history…",
    loadError: "Inspection history could not be loaded.",
    error: "The inspection could not be recorded. Your entries have been kept.",
    validation:
      "Check the validity and result. A document confirmation also needs the inspection date and both documents. A passed inspection needs a validity date.",
    vinMismatch:
      "The document VIN differs from this scooter. Correct the document review before recording this inspection.",
    conflict:
      "This inspection was already recorded with different values. Reload its history before continuing.",
    missingEvidence:
      "You can enter validity manually. To confirm from documents, add the updated yellow card and the inspection certificate.",
    extracted: "Use extracted inspection: {date}",
    history: "Inspection history",
    empty: "No confirmed inspection has been recorded.",
    initialCoverage:
      "Initial RAR inspection: CIV issued {issuedAt}, valid until {validUntil}.",
    unverified:
      "Review the dates of subsequent inspections. The initial RAR inspection is valid for two years from CIV issuance.",
    evidenceConflict:
      "The selected yellow card and certificate have different inspection readings. Compare both originals and correct the dates/result before confirming.",
  },
  ro: {
    documents: "Documente ITP",
    update: "Actualizează ITP",
    fromDocuments: "Verifică documentele ITP",
    close: "Închide",
    manualSource: "Sursă: introducere manuală",
    documentSource: "Sursă: documente verificate",
    manualHint:
      "Introdu data până la care este valabil ITP-ul, nu o programare viitoare. Păstrează rezultatul neclar dacă nu îl poți confirma. Data inspecției este opțională la introducerea manuală. Înregistrările anterioare rămân în istoric.",
    manualReviewed:
      "Am verificat valabilitatea și rezultatul pentru acest scuter.",
    calculatedFromCiv:
      "Calculată din data emiterii CIV (inspecția inițială de doi ani).",
    title: "Inspecții tehnice (ITP)",
    status: {
      missing: "ITP neînregistrat",
      review: "ITP de verificat",
      active: "ITP valabil",
      expiring: "ITP expiră curând",
      expired: "ITP expirat",
      failed: "Inspecție respinsă",
    },
    renewal:
      "Încarcă anexa galbenă actualizată și cel mai recent certificat ITP, apoi verifică inspecția mai jos.",
    upload: "Încarcă documentele ITP",
    add: "Înregistrează documentele verificate",
    inspectionDate: "Data inspecției",
    validUntil: "Valabil până la",
    result: "Rezultatul inspecției",
    passed: "Admis",
    failed: "Respins",
    unknown: "Neclar — necesită verificare",
    certificateNumber: "Numărul certificatului",
    odometerKm: "Kilometraj la inspecție (km)",
    card: "Anexa galbenă ITP",
    certificate: "Certificatul ITP",
    choose: "Alege un document",
    reviewed:
      "Am verificat ambele scanări, identitatea vehiculului și datele inspecției.",
    save: "Confirmă inspecția",
    saved: "Inspecție înregistrată",
    loading: "Se încarcă istoricul ITP…",
    loadError: "Istoricul ITP nu a putut fi încărcat.",
    error:
      "Inspecția nu a putut fi înregistrată. Datele introduse au fost păstrate.",
    validation:
      "Verifică valabilitatea și rezultatul. Confirmarea din documente necesită data inspecției și ambele documente. O inspecție admisă necesită data expirării.",
    vinMismatch:
      "VIN-ul documentului diferă de cel al scuterului. Corectează verificarea documentului înainte de înregistrarea inspecției.",
    conflict:
      "Inspecția a fost deja înregistrată cu alte valori. Reîncarcă istoricul înainte de a continua.",
    missingEvidence:
      "Poți introduce valabilitatea manual. Pentru confirmarea din documente, adaugă anexa galbenă actualizată și certificatul ITP.",
    extracted: "Folosește inspecția extrasă: {date}",
    history: "Istoricul inspecțiilor",
    empty: "Nu există nicio inspecție confirmată.",
    initialCoverage:
      "Inspecție RAR inițială: CIV emis la {issuedAt}, valabilă până la {validUntil}.",
    unverified:
      "Verifică datele inspecțiilor ulterioare. Inspecția RAR inițială este valabilă doi ani de la eliberarea CIV.",
    evidenceConflict:
      "Anexa galbenă și certificatul selectat au date diferite pentru inspecție. Compară ambele originale și corectează datele sau rezultatul înainte de confirmare.",
  },
} as const;
