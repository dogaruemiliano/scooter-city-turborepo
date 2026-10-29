export const scooterReextractionMessages = {
  en: {
    action: "Extract document data again",
    title: "Review extracted data",
    description:
      "Choose which suggestions to apply. Existing values are kept by default. Nothing is saved until you save the scooter form.",
    progress: "Analyzing documents: {done} of {total} completed…",
    found:
      "Found {additions, plural, one {# addition} other {# additions}} and {differences, plural, one {# difference} other {# differences}}. Review the originals before applying.",
    current: "Current value",
    extracted: "Extracted value",
    empty: "Not provided",
    unknownBrand: "Unavailable brand",
    apply:
      "Apply {count, plural, one {# suggestion} other {# suggestions}} to form",
    applying: "Applying suggestions…",
    applied:
      "Suggestions applied to the form. Save the scooter to keep these changes.",
    close: "Close without applying",
    cancelAnalysis: "Cancel analysis",
    partialFailure:
      "Some documents could not be analyzed. Successful results are available; retry only the failed documents.",
    retryFailed: "Analyze failed documents again",
    vinMismatch:
      "These documents contain a conflicting VIN. Their suggestions are excluded. Check the originals and correct the document identity before extracting again.",
    noChanges:
      "No additions or differences found. Existing data has been kept.",
    needsReview:
      "Some readings are incomplete, conflicting or cannot be applied safely. Check the original document and complete those fields manually.",
    documentEvidence: "Document readings: {name}",
    evidenceDetails: "Review {count} new or changed document readings",
    evidenceHint:
      "Accepted document readings retain the previous extraction. ITP inspections and new or unassigned insurance policies must be confirmed separately after saving; existing records are kept.",
    rawField: "Original CIV field: {field}",
    inspection: "Inspection",
    initialItpHint:
      "Without a recorded ITP inspection, the initial expiry is calculated as the CIV issue date plus two years.",
    saveConflict:
      "This scooter was changed in another session. Your entered values are still here. Copy your changes, reload the page, and review the current data before saving again.",
  },
  ro: {
    action: "Reextrage datele din documente",
    title: "Verifică datele extrase",
    description:
      "Alege propunerile pe care le aplici. Valorile existente sunt păstrate implicit. Datele se salvează doar când salvezi formularul scuterului.",
    progress: "Se analizează documentele: {done} din {total} finalizate…",
    found:
      "Am găsit {additions, plural, one {o completare} few {# completări} other {# de completări}} și {differences, plural, one {o diferență} few {# diferențe} other {# de diferențe}}. Verifică documentele originale înainte de aplicare.",
    current: "Valoare actuală",
    extracted: "Valoare extrasă",
    empty: "Necompletat",
    unknownBrand: "Marcă indisponibilă",
    apply:
      "Aplică {count, plural, one {o propunere} few {# propuneri} other {# de propuneri}} în formular",
    applying: "Se aplică propunerile…",
    applied:
      "Propunerile au fost aplicate în formular. Salvează scuterul pentru a păstra modificările.",
    close: "Închide fără aplicare",
    cancelAnalysis: "Anulează analiza",
    partialFailure:
      "Unele documente nu au putut fi analizate. Rezultatele reușite sunt disponibile; poți relua doar documentele eșuate.",
    retryFailed: "Reanalizează documentele eșuate",
    vinMismatch:
      "Aceste documente conțin un VIN diferit. Propunerile lor sunt excluse. Verifică originalele și corectează identificarea documentelor înainte de reextragere.",
    noChanges:
      "Nu am găsit completări sau diferențe. Datele existente au fost păstrate.",
    needsReview:
      "Unele citiri sunt incomplete, contradictorii sau nu pot fi aplicate în siguranță. Verifică documentul original și completează manual câmpurile respective.",
    documentEvidence: "Datele documentului: {name}",
    evidenceDetails:
      "Verifică {count} citiri noi sau modificate ale documentului",
    evidenceHint:
      "Datele documentului acceptate păstrează extragerea anterioară. Inspecțiile ITP și polițele noi sau neasociate se confirmă separat după salvare; înregistrările existente sunt păstrate.",
    rawField: "Rubrică originală CIV: {field}",
    inspection: "Inspecție",
    initialItpHint:
      "Fără o inspecție ITP înregistrată, termenul inițial se calculează din data emiterii CIV plus doi ani.",
    saveConflict:
      "Scuterul a fost modificat în altă sesiune. Valorile introduse sunt păstrate aici. Copiază modificările, reîncarcă pagina și verifică datele actuale înainte de o nouă salvare.",
  },
} as const;
