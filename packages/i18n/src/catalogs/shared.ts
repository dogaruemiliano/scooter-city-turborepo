export const sharedCatalog = {
  en: {
    actions: {
      cancel: "Cancel",
      close: "Close",
      continue: "Continue",
      loadMore: "Load more",
      retry: "Retry",
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
  },
  ro: {
    actions: {
      cancel: "Anulează",
      close: "Închide",
      continue: "Continuă",
      loadMore: "Încarcă mai multe",
      retry: "Încearcă din nou",
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
  },
} as const;
