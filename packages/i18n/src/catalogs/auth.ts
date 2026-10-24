export const authCatalog = {
  en: {
    avatar: {
      title: "Profile picture",
      choose: "Choose a picture",
      add: "Add picture",
      change: "Change picture",
      help: "JPEG, PNG or WebP, up to 5 MB and 4096 pixels per side.",
      save: "Save picture",
      saving: "Saving picture…",
      saved: "Picture saved",
      remove: "Remove picture",
      removing: "Removing picture…",
      removed: "Picture removed",
      invalid: "Choose a JPEG, PNG or WebP image up to 5 MB.",
      failed: "Could not update your picture. Please try again.",
    },
    signIn: {
      title: "Sign in",
      subtitle: "Choose a method to continue.",
      separator: "or",
      unavailable:
        "No sign-in methods are available. Contact an administrator.",
      emailOtp: {
        emailLabel: "Email",
        emailInvalid: "Enter a valid email address.",
        sendCode: "Continue with email",
        sendingCode: "Sending...",
        sendCodeError: "Could not send code. Try again.",
      },
    },
    otp: {
      title: "Enter verification code",
      subtitleEmail:
        "We sent a 6-digit code to <emailRow><strong>{email}</strong></emailRow>",
      subtitleProvider:
        "We sent a 6-digit code to the email on your Google account.",
      backToMethods: "Back to sign-in methods",
      codeLabel: "6-digit code",
      codeSentTo: "Code sent to {email}",
      emailVerificationRequired:
        "Google could not verify the account email. Enter the code we sent to it.",
      expired: "This code has expired.",
      expiresIn: "Code expires in {time}.",
      requestAnotherCode: "Request another code",
      requestingAnotherCode: "Requesting...",
      verify: "Verify code",
      verifying: "Verifying...",
      resendCode: "Resend code",
      resendIn: "Resend in {time}",
      errors: {
        invalidOrExpired: "Invalid or expired code.",
        resendFailed: "Could not resend code.",
        requestAnotherFailed: "Could not request another code. Try again.",
      },
    },
    google: {
      failed: "Google sign-in failed. Try again.",
      expired: "Your Google sign-in expired. Continue with Google again.",
    },
    logout: {
      label: "Sign out",
      busy: "Signing out...",
    },
    errors: {
      csrf: "Refresh the page and try again.",
      sessionExpired: "Your session expired. Please sign in again.",
    },
  },
  ro: {
    avatar: {
      title: "Fotografie de profil",
      choose: "Alege o fotografie",
      add: "Adaugă o fotografie",
      change: "Schimbă fotografia",
      help: "JPEG, PNG sau WebP, maximum 5 MB și 4096 pixeli pe latură.",
      save: "Salvează fotografia",
      saving: "Se salvează fotografia…",
      saved: "Fotografie salvată",
      remove: "Elimină fotografia",
      removing: "Se elimină fotografia…",
      removed: "Fotografie eliminată",
      invalid: "Alege o imagine JPEG, PNG sau WebP de maximum 5 MB.",
      failed: "Fotografia nu a putut fi actualizată. Încearcă din nou.",
    },
    signIn: {
      title: "Autentificare",
      subtitle: "Alege o metodă pentru a continua.",
      separator: "sau",
      unavailable:
        "Nu există metode de autentificare disponibile. Contactează un administrator.",
      emailOtp: {
        emailLabel: "Email",
        emailInvalid: "Introdu o adresă de email validă.",
        sendCode: "Continuă cu email",
        sendingCode: "Se trimite...",
        sendCodeError: "Codul nu a putut fi trimis. Încearcă din nou.",
      },
    },
    otp: {
      title: "Introdu codul de verificare",
      subtitleEmail:
        "Am trimis un cod din 6 cifre la <emailRow><strong>{email}</strong></emailRow>",
      subtitleProvider:
        "Am trimis un cod din 6 cifre la emailul contului Google.",
      backToMethods: "Înapoi la metodele de autentificare",
      codeLabel: "Cod din 6 cifre",
      codeSentTo: "Cod trimis la {email}",
      emailVerificationRequired:
        "Google nu a putut verifica emailul contului. Introdu codul trimis.",
      expired: "Codul a expirat.",
      expiresIn: "Codul expiră în {time}.",
      requestAnotherCode: "Cere alt cod",
      requestingAnotherCode: "Se cere...",
      verify: "Verifică codul",
      verifying: "Se verifică...",
      resendCode: "Retrimite codul",
      resendIn: "Retrimite în {time}",
      errors: {
        invalidOrExpired: "Cod invalid sau expirat.",
        resendFailed: "Codul nu a putut fi retrimis.",
        requestAnotherFailed: "Nu s-a putut cere alt cod. Încearcă din nou.",
      },
    },
    google: {
      failed: "Autentificarea cu Google a eșuat. Încearcă din nou.",
      expired:
        "Autentificarea cu Google a expirat. Continuă din nou cu Google.",
    },
    logout: {
      label: "Deconectare",
      busy: "Se deconectează...",
    },
    errors: {
      csrf: "Reîncarcă pagina și încearcă din nou.",
      sessionExpired: "Sesiunea a expirat. Autentifică-te din nou.",
    },
  },
} as const;
