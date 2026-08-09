export const serviceCatalog = {
  en: {
    routeStates: {
      loadingLabel: "Loading fleet service status",
      errorTitle: "Service could not be loaded",
      errorDescription:
        "The fleet service data is temporarily unavailable. Try loading this page again.",
      retry: "Try again",
    },
    dashboard: {
      title: "Fleet service",
      description:
        "Open problems and scheduled maintenance that need operational attention.",
      stats: {
        label: "Fleet service summary",
        total: "Total scooters",
        openIssues: "With open problems",
        blocking: "Recommended unavailable",
        overdue: "Maintenance overdue",
        dueSoon: "Maintenance due soon",
      },
    },
    issues: {
      title: "Open problems",
      description:
        "{count, plural, =0 {No open problems} one {# open problem} other {# open problems}} across the active fleet.",
      empty: "No open problems have been reported.",
      reportedAt: "Reported {date}",
    },
    schedule: {
      title: "Scheduled maintenance",
      description:
        "{count, plural, =0 {No upcoming interventions} one {# upcoming intervention} other {# upcoming interventions}} due soon or overdue.",
      empty: "No maintenance is due soon or overdue.",
      dueAt: "Due {date}",
      dueKm: "Due at {value, number} km",
      statuses: {
        DUE_SOON: "Due soon",
        OVERDUE: "Overdue",
      },
    },
    feedback: {
      genericError: "The next service entries could not be loaded.",
    },
    issueSeverities: {
      LOW: "Low",
      MEDIUM: "Medium",
      HIGH: "High",
      CRITICAL: "Critical",
    },
  },
  ro: {
    routeStates: {
      loadingLabel: "Se încarcă starea de service a flotei",
      errorTitle: "Pagina Service nu a putut fi încărcată",
      errorDescription:
        "Datele de service ale flotei sunt momentan indisponibile. Încearcă să încarci din nou pagina.",
      retry: "Încearcă din nou",
    },
    dashboard: {
      title: "Service flotă",
      description:
        "Probleme deschise și mentenanță programată care necesită atenție operațională.",
      stats: {
        label: "Sumar service flotă",
        total: "Total scutere",
        openIssues: "Cu probleme deschise",
        blocking: "Recomandate indisponibile",
        overdue: "Mentenanță depășită",
        dueSoon: "Mentenanță scadentă curând",
      },
    },
    issues: {
      title: "Probleme deschise",
      description:
        "{count, plural, =0 {Nicio problemă deschisă} one {# problemă deschisă} few {# probleme deschise} other {# de probleme deschise}} în flota activă.",
      empty: "Nu a fost raportată nicio problemă deschisă.",
      reportedAt: "Raportată la {date}",
    },
    schedule: {
      title: "Mentenanță programată",
      description:
        "{count, plural, =0 {Nicio intervenție viitoare} one {# intervenție viitoare} few {# intervenții viitoare} other {# de intervenții viitoare}} scadentă curând sau depășită.",
      empty: "Nicio mentenanță nu este scadentă curând sau depășită.",
      dueAt: "Scadentă la {date}",
      dueKm: "Scadentă la {value, number} km",
      statuses: {
        DUE_SOON: "Scadentă curând",
        OVERDUE: "Depășită",
      },
    },
    feedback: {
      genericError:
        "Următoarele înregistrări de service nu au putut fi încărcate.",
    },
    issueSeverities: {
      LOW: "minoră",
      MEDIUM: "medie",
      HIGH: "gravă",
      CRITICAL: "critică",
    },
  },
} as const;
