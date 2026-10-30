export const scooterComplianceMessages = {
  en: {
    itpHelp: "Valid until — not a future inspection appointment.",
    useItp: "Use extracted date: {date}",
    itpConflict:
      "The documents contain different ITP validity dates. Choose the correct date after checking the originals.",
    addHint: "Complete the current insurance before adding another.",
    emptyInsurance: "Enter policy details before saving the scooter.",
  },
  ro: {
    itpHelp: "Valabil până la — nu o programare viitoare la inspecție.",
    useItp: "Folosește data extrasă: {date}",
    itpConflict:
      "Documentele conțin date de valabilitate ITP diferite. Alege data corectă după verificarea originalelor.",
    addHint: "Completează asigurarea curentă înainte de a adăuga alta.",
    emptyInsurance:
      "Completează datele poliței înainte de salvarea scuterului.",
  },
} as const;
