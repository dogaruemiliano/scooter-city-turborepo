export const apiCatalog = {
  en: {
    auth: {
      otpEmailSubject: "{code} is your Scooter City sign-in code",
      otpEmailHeading: "Your sign-in code",
      otpEmailPreview: "Enter this code to access your Scooter City account.",
      otpEmailIntro:
        "Enter this code to sign in or create your Scooter City account.",
      otpEmailExpiry:
        "This code expires {minutes} minutes after your original request.",
      otpEmailSafety:
        "Never share this code with anyone. If you didn’t request it, you can ignore this email.",
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
      otpEmailSubject: "{code} este codul tău de autentificare Scooter City",
      otpEmailHeading: "Codul tău de autentificare",
      otpEmailPreview:
        "Introdu acest cod pentru a accesa contul tău Scooter City.",
      otpEmailIntro:
        "Introdu acest cod pentru a te autentifica sau pentru a crea un cont Scooter City.",
      otpEmailExpiry:
        "Acest cod expiră la {minutes} minute după solicitarea inițială.",
      otpEmailSafety:
        "Nu divulga acest cod nimănui. Dacă nu ai solicitat codul, poți ignora acest email.",
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
