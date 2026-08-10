export const sharedCatalog = {
  en: {
    actions: {
      cancel: "Cancel",
      close: "Close",
      continue: "Continue",
      loadMore: "Load more",
      retry: "Retry",
    },
    datePicker: {
      chooseMonthAndYear: "Choose month and year",
      done: "Done",
      month: "Month",
      nextMonth: "Next month",
      open: "Open calendar",
      previousMonth: "Previous month",
      year: "Year",
    },
    errors: {
      forbidden: "You do not have access to this resource.",
      generic: "Something went wrong. Please try again.",
      network: "Check your connection and try again.",
      notFound: "The requested resource was not found.",
      unauthorized: "Please sign in to continue.",
      validation: "Please check the highlighted fields.",
    },
    status: {
      loading: "Loading...",
      saving: "Saving...",
    },
    validation: {
      fallback: "Check this field.",
      futureDate: "{field} cannot be in the future.",
      invalid: "Enter a valid {field}.",
      maxLength: "{field} must be {max} characters or fewer.",
      minLength: "{field} must be at least {min} characters.",
      required: "{field} is required.",
      summary:
        "{count, plural, one {# field needs attention} other {# fields need attention}}.",
    },
  },
  ro: {
    actions: {
      cancel: "Anulează",
      close: "Închide",
      continue: "Continuă",
      loadMore: "Încarcă mai multe",
      retry: "Încearcă din nou",
    },
    datePicker: {
      chooseMonthAndYear: "Alege luna și anul",
      done: "Gata",
      month: "Luna",
      nextMonth: "Luna următoare",
      open: "Deschide calendarul",
      previousMonth: "Luna anterioară",
      year: "Anul",
    },
    errors: {
      forbidden: "Nu ai acces la această resursă.",
      generic: "A apărut o eroare. Încearcă din nou.",
      network: "Verifică conexiunea și încearcă din nou.",
      notFound: "Resursa cerută nu a fost găsită.",
      unauthorized: "Autentifică-te pentru a continua.",
      validation: "Verifică câmpurile marcate.",
    },
    status: {
      loading: "Se încarcă...",
      saving: "Se salvează...",
    },
    validation: {
      fallback: "Verifică acest câmp.",
      futureDate: "{field} nu poate fi în viitor.",
      invalid: "Introdu o valoare validă pentru {field}.",
      maxLength: "{field} trebuie să aibă cel mult {max} caractere.",
      minLength: "{field} trebuie să aibă cel puțin {min} caractere.",
      required: "{field} este obligatoriu.",
      summary:
        "{count, plural, one {# câmp necesită atenție} few {# câmpuri necesită atenție} other {# de câmpuri necesită atenție}}.",
    },
  },
} as const;
