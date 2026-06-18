import type { SupportedLocale } from "./locales";

export type MessageTree = {
  readonly [key: string]: string | MessageTree;
};

export type MessageCatalogs = Readonly<Record<SupportedLocale, MessageTree>>;

export const messages = {
  en: {
    shared: {
      actions: {
        cancel: "Cancel",
        close: "Close",
        continue: "Continue",
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
    api: {
      auth: {
        otpEmailSubject: "Your sign-in code",
        otpExpired: "The code has expired. Request a new one.",
        otpInvalid: "The code is invalid or expired.",
        otpSent: "Your code is {code}. It expires in {ttl} minutes.",
        sessionExpired: "Your session expired. Please sign in again.",
      },
      errors: {
        conflict: "The request conflicts with the current resource state.",
        forbidden: "This action is not allowed.",
        generic: "The request could not be completed.",
        notFound: "The requested resource does not exist.",
        rateLimited: "Too many requests. Try again in {ttl} seconds.",
        unauthorized: "Authentication is required.",
        validation: "The request contains invalid data.",
      },
    },
    mobile: {
      auth: {
        biometricPrompt: "Confirm your identity to continue.",
        secureStorageUnavailable:
          "Secure storage is unavailable on this device.",
      },
      errors: {
        offline: "You appear to be offline.",
        refreshFailed: "Could not refresh your session.",
      },
    },
    web: {
      auth: {
        signInTitle: "Sign in",
        signOut: "Sign out",
      },
      errors: {
        csrf: "Refresh the page and try again.",
        sessionExpired: "Your session expired. Please sign in again.",
      },
    },
  },
  ro: {
    shared: {
      actions: {
        cancel: "Anulează",
        close: "Închide",
        continue: "Continuă",
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
    api: {
      auth: {
        otpEmailSubject: "Codul tău de autentificare",
        otpExpired: "Codul a expirat. Cere unul nou.",
        otpInvalid: "Codul este invalid sau a expirat.",
        otpSent: "Codul tău este {code}. Expiră în {ttl} minute.",
        sessionExpired: "Sesiunea a expirat. Autentifică-te din nou.",
      },
      errors: {
        conflict: "Cererea intră în conflict cu starea curentă a resursei.",
        forbidden: "Această acțiune nu este permisă.",
        generic: "Cererea nu a putut fi finalizată.",
        notFound: "Resursa cerută nu există.",
        rateLimited: "Prea multe cereri. Încearcă din nou în {ttl} secunde.",
        unauthorized: "Autentificarea este necesară.",
        validation: "Cererea conține date invalide.",
      },
    },
    mobile: {
      auth: {
        biometricPrompt: "Confirmă-ți identitatea pentru a continua.",
        secureStorageUnavailable:
          "Stocarea securizată nu este disponibilă pe acest dispozitiv.",
      },
      errors: {
        offline: "Se pare că ești offline.",
        refreshFailed: "Sesiunea nu a putut fi reîmprospătată.",
      },
    },
    web: {
      auth: {
        signInTitle: "Autentificare",
        signOut: "Deconectare",
      },
      errors: {
        csrf: "Reîncarcă pagina și încearcă din nou.",
        sessionExpired: "Sesiunea a expirat. Autentifică-te din nou.",
      },
    },
  },
} as const satisfies MessageCatalogs;

export type MessageCatalog = (typeof messages)[SupportedLocale];
export type MessageNamespace = keyof MessageCatalog;
export type MessageKey = LeafPath<(typeof messages)["en"]>;

type LeafPath<T> = {
  [Key in Extract<keyof T, string>]: T[Key] extends string
    ? Key
    : T[Key] extends Readonly<Record<string, unknown>>
      ? `${Key}.${LeafPath<T[Key]>}`
      : never;
}[Extract<keyof T, string>];
