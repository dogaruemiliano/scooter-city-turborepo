export const scooterComplianceMessages = {
  en: {
    daysRemaining:
      "{count, plural, one {# day remaining} other {# days remaining}}",
    expiredDaysAgo:
      "{count, plural, one {Expired # day ago} other {Expired # days ago}}",
    expiresToday: "Expires today",
    noItpValidity: "No ITP validity date recorded.",
    noInsurance: "No insurance recorded.",
    validityUnknown: "Validity date unavailable",

    itpHelp: "Valid until — not a future inspection appointment.",
    useItp: "Use extracted date: {date}",
    itpConflict:
      "The documents contain different ITP validity dates. Choose the correct date after checking the originals.",
    addHint: "Complete the current insurance before adding another.",
    emptyInsurance: "Enter policy details before saving the scooter.",
  },
  ro: {
    daysRemaining:
      "{count, plural, one {# zi rămasă} few {# zile rămase} other {# de zile rămase}}",
    expiredDaysAgo:
      "{count, plural, one {Expirat de # zi} few {Expirat de # zile} other {Expirat de # de zile}}",
    expiresToday: "Expiră astăzi",
    noItpValidity: "Nu există o dată de valabilitate ITP înregistrată.",
    noInsurance: "Nu există o asigurare înregistrată.",
    validityUnknown: "Data de valabilitate nu este disponibilă",

    itpHelp: "Valabil până la — nu o programare viitoare la inspecție.",
    useItp: "Folosește data extrasă: {date}",
    itpConflict:
      "Documentele conțin date de valabilitate ITP diferite. Alege data corectă după verificarea originalelor.",
    addHint: "Completează asigurarea curentă înainte de a adăuga alta.",
    emptyInsurance:
      "Completează datele poliței înainte de salvarea scuterului.",
  },
} as const;
