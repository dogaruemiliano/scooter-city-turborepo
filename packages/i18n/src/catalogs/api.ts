export const apiCatalog = {
  en: {
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
      imageStorageBucketUnavailable: "Image storage bucket is not available.",
      imageStorageUnavailable: "Image storage is not available.",
      notFound: "The requested resource does not exist.",
      personEmailConflict: "Email already exists.",
      personPhoneConflict: "Phone already exists.",
      rateLimited: "Too many requests. Try again in {ttl} seconds.",
      unauthorized: "Authentication is required.",
      validation: "The request contains invalid data.",
    },
  },
  ro: {
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
      imageStorageBucketUnavailable:
        "Bucketul pentru imagini nu este disponibil.",
      imageStorageUnavailable: "Stocarea imaginilor nu este disponibilă.",
      notFound: "Resursa cerută nu există.",
      personEmailConflict: "Emailul există deja.",
      personPhoneConflict: "Telefonul există deja.",
      rateLimited: "Prea multe cereri. Încearcă din nou în {ttl} secunde.",
      unauthorized: "Autentificarea este necesară.",
      validation: "Cererea conține date invalide.",
    },
  },
} as const;
