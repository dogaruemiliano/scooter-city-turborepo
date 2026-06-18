import {
  createFormatter,
  fallbackLocale,
  type CatalogsByLocale,
  type Formatter,
  type FormatterOptions,
  type InterpolationValues,
  type MessageKey,
  type MessageTree,
  type SupportedLocale,
} from "@repo/i18n";

export const mobileMessages = {
  en: {
    nav: {
      home: "Home",
      uiKit: "UI Kit",
      theme: "Theme",
    },
    home: {
      title: "Home",
      welcome: "Welcome - open the drawer to navigate.",
    },
    preferences: {
      language: {
        title: "Language",
        subtitle:
          "Choose the app language. Device keeps following your system preference.",
        device: "Device",
        current: "Current language: {language}",
        sourceDevice: "Device preference",
        sourceManual: "Manual selection",
      },
    },
    theme: {
      sections: {
        colors: "Colors",
        spacing: "Spacing",
        radius: "Radius",
        typographySize: "Typography - Size",
        typographyWeight: "Typography - Weight",
        typographyLineHeight: "Typography - Line Height",
        typographyLetterSpacing: "Typography - Letter Spacing",
        shadow: "Shadow",
        motionDuration: "Motion - Duration",
        motionEasing: "Motion - Easing",
        zIndex: "Z-Index",
      },
      samples: {
        size: "{name} - Aa",
        weight: "{name} - Aa Bb Cc",
        lineHeight: "{name} - Quick brown fox",
        letterSpacing: "{name} - Spacing sample",
      },
      units: {
        pixels: "{value}px",
        milliseconds: "{value}ms",
      },
      values: {
        full: "full",
      },
    },
    uiKit: {
      header: {
        title: "Components",
        subtitle:
          "A reference for every component currently exported from @repo/ui-native.",
      },
      sections: {
        decButton: {
          title: "DecButton",
          subtitle:
            "Pressable action. Variants x sizes x disabled state.",
        },
        decCard: {
          title: "DecCard",
          subtitle:
            "Surface container with three padding scales. Children are arbitrary.",
        },
        decBadge: {
          title: "DecBadge",
          subtitle: "Pill-shaped status label. 5 variants x 2 sizes.",
        },
        decText: {
          title: "DecText",
          subtitle:
            "9 size steps x 4 weights x 4 semantic colors. Backed by typography tokens.",
        },
        decInput: {
          title: "DecInput",
          subtitle:
            "Single-line text input. Border reacts to focus / error / editable. Optional label, hint, and error text.",
        },
        decBottomSheet: {
          title: "DecBottomSheet",
          subtitle:
            "Ref-based modal sheet. Dynamic height by default; pass snapPoints for fixed sizes. Header is a string (auto close button) or a custom node.",
        },
      },
      groups: {
        variants: "Variants",
        sizes: "Sizes",
        disabled: "Disabled",
        paddingScales: "Padding scales",
        composition: "Composition",
        variantsSm: "Variants - sm",
        variantsMd: "Variants - md",
        sizeScale: "Size scale",
        weights: "Weights",
        semanticColors: "Semantic colors",
        states: "States",
        withLabelAndHint: "With label and hint",
        withLabelAndError: "With label and error",
        labelOnly: "Label only",
        dynamicFitsContent: "Dynamic - fits content",
        fixedSnapPoints: "Fixed snap points - 50% / 90%",
        customHeaderNode: "Custom header node",
      },
      buttons: {
        primary: "Primary",
        secondary: "Secondary",
        small: "Small",
        medium: "Medium",
        large: "Large",
        openDynamic: "Open dynamic",
        openFixed: "Open fixed",
        openCustomHeader: "Open custom header",
        done: "Done",
        close: "Close",
      },
      card: {
        paddingSm: 'padding="sm" - spacing[3] (12px)',
        paddingMd: 'padding="md" - spacing[4] (16px, default)',
        paddingLg: 'padding="lg" - spacing[6] (24px)',
        title: "Card title",
        body:
          "Cards compose with any child. Here a title, body text, and a row of badges.",
        badgeFeatured: "Featured",
        badgeStable: "Stable",
      },
      badges: {
        neutral: "neutral",
        action: "action",
        danger: "danger",
        success: "success",
        warning: "warning",
      },
      text: {
        sizeXs: "xs - 12px",
        sizeSm: "sm - 14px",
        sizeBase: "base - 16px (default)",
        sizeLg: "lg - 18px",
        sizeXl: "xl - 20px",
        size2xl: "2xl - 24px",
        size3xl: "3xl - 30px",
        size4xl: "4xl - 36px",
        size5xl: "5xl - 48px",
        weightRegular: "regular - 400",
        weightMedium: "medium - 500",
        weightSemibold: "semibold - 600",
        weightBold: "bold - 700",
        semanticPrimary: 'color="primary" - text.primary',
        semanticSecondary: 'color="secondary" - text.secondary',
        semanticTertiary: 'color="tertiary" - text.tertiary',
        semanticDisabled: 'color="disabled" - text.disabled',
      },
      input: {
        placeholderDefault: "Default - tap to focus me",
        placeholderPrefilled: "Pre-filled",
        defaultValue: "some content already typed",
        placeholderWithError: "With error",
        error: "Something's off.",
        placeholderDisabled: "Disabled",
        disabledValue: "cannot edit",
        emailLabel: "Email",
        emailHint: "We'll never share it.",
        placeholderEmail: "you@example.com",
        emailError: "Enter a valid email address.",
        displayNameLabel: "Display name",
        placeholderDisplayName: "Jane Doe",
      },
      sheet: {
        quickActions: "Quick actions",
        dynamicBody:
          "The sheet auto-sizes to fit its content. Drag down or tap the backdrop to dismiss.",
        filters: "Filters",
        fixedBody:
          "Fixed snap points. Drag the handle up to expand, down to collapse or dismiss.",
        customBadge: "Custom",
        customHeader: "Anything fits here",
        customBody:
          "When `header` is a ReactNode, the wrapper renders it as-is - no built-in close button, you compose whatever you need.",
      },
    },
  },
  ro: {
    nav: {
      home: "Acasă",
      uiKit: "Kit UI",
      theme: "Temă",
    },
    home: {
      title: "Acasă",
      welcome: "Bun venit - deschide meniul lateral pentru navigare.",
    },
    preferences: {
      language: {
        title: "Limbă",
        subtitle:
          "Alege limba aplicației. Dispozitiv urmează preferința sistemului.",
        device: "Dispozitiv",
        current: "Limba curentă: {language}",
        sourceDevice: "Preferința dispozitivului",
        sourceManual: "Selecție manuală",
      },
    },
    theme: {
      sections: {
        colors: "Culori",
        spacing: "Spațiere",
        radius: "Raze",
        typographySize: "Tipografie - dimensiune",
        typographyWeight: "Tipografie - grosime",
        typographyLineHeight: "Tipografie - înălțime linie",
        typographyLetterSpacing: "Tipografie - spațiere litere",
        shadow: "Umbre",
        motionDuration: "Mișcare - durată",
        motionEasing: "Mișcare - atenuare",
        zIndex: "Z-Index",
      },
      samples: {
        size: "{name} - Aa",
        weight: "{name} - Aa Bb Cc",
        lineHeight: "{name} - Vulpea brună rapidă",
        letterSpacing: "{name} - Eșantion de spațiere",
      },
      units: {
        pixels: "{value}px",
        milliseconds: "{value}ms",
      },
      values: {
        full: "complet",
      },
    },
    uiKit: {
      header: {
        title: "Componente",
        subtitle:
          "O referință pentru fiecare componentă exportată acum din @repo/ui-native.",
      },
      sections: {
        decButton: {
          title: "DecButton",
          subtitle:
            "Acțiune apăsabilă. Variante x dimensiuni x stare dezactivată.",
        },
        decCard: {
          title: "DecCard",
          subtitle:
            "Container de suprafață cu trei niveluri de padding. Conținutul este arbitrar.",
        },
        decBadge: {
          title: "DecBadge",
          subtitle: "Etichetă de status tip pastilă. 5 variante x 2 dimensiuni.",
        },
        decText: {
          title: "DecText",
          subtitle:
            "9 trepte de dimensiune x 4 grosimi x 4 culori semantice. Bazat pe tokenuri de tipografie.",
        },
        decInput: {
          title: "DecInput",
          subtitle:
            "Câmp text pe un singur rând. Bordura reacționează la focus / eroare / editabil. Label, indiciu și eroare opționale.",
        },
        decBottomSheet: {
          title: "DecBottomSheet",
          subtitle:
            "Foaie modală bazată pe ref. Înălțime dinamică implicit; poți trimite snapPoints pentru dimensiuni fixe. Headerul este text sau nod custom.",
        },
      },
      groups: {
        variants: "Variante",
        sizes: "Dimensiuni",
        disabled: "Dezactivat",
        paddingScales: "Niveluri de padding",
        composition: "Compoziție",
        variantsSm: "Variante - sm",
        variantsMd: "Variante - md",
        sizeScale: "Scară dimensiuni",
        weights: "Grosimi",
        semanticColors: "Culori semantice",
        states: "Stări",
        withLabelAndHint: "Cu label și indiciu",
        withLabelAndError: "Cu label și eroare",
        labelOnly: "Doar label",
        dynamicFitsContent: "Dinamic - se potrivește conținutului",
        fixedSnapPoints: "Snap points fixe - 50% / 90%",
        customHeaderNode: "Nod header custom",
      },
      buttons: {
        primary: "Principal",
        secondary: "Secundar",
        small: "Mic",
        medium: "Mediu",
        large: "Mare",
        openDynamic: "Deschide dinamic",
        openFixed: "Deschide fix",
        openCustomHeader: "Deschide header custom",
        done: "Gata",
        close: "Închide",
      },
      card: {
        paddingSm: 'padding="sm" - spacing[3] (12px)',
        paddingMd: 'padding="md" - spacing[4] (16px, implicit)',
        paddingLg: 'padding="lg" - spacing[6] (24px)',
        title: "Titlu card",
        body:
          "Cardurile acceptă orice conținut. Aici sunt un titlu, text de corp și un rând de etichete.",
        badgeFeatured: "Evidențiat",
        badgeStable: "Stabil",
      },
      badges: {
        neutral: "neutru",
        action: "acțiune",
        danger: "pericol",
        success: "succes",
        warning: "avertizare",
      },
      text: {
        sizeXs: "xs - 12px",
        sizeSm: "sm - 14px",
        sizeBase: "base - 16px (implicit)",
        sizeLg: "lg - 18px",
        sizeXl: "xl - 20px",
        size2xl: "2xl - 24px",
        size3xl: "3xl - 30px",
        size4xl: "4xl - 36px",
        size5xl: "5xl - 48px",
        weightRegular: "regular - 400",
        weightMedium: "medium - 500",
        weightSemibold: "semibold - 600",
        weightBold: "bold - 700",
        semanticPrimary: 'color="primary" - text.primary',
        semanticSecondary: 'color="secondary" - text.secondary',
        semanticTertiary: 'color="tertiary" - text.tertiary',
        semanticDisabled: 'color="disabled" - text.disabled',
      },
      input: {
        placeholderDefault: "Implicit - atinge pentru focus",
        placeholderPrefilled: "Precompletat",
        defaultValue: "conținut deja introdus",
        placeholderWithError: "Cu eroare",
        error: "Ceva nu este în regulă.",
        placeholderDisabled: "Dezactivat",
        disabledValue: "nu poate fi editat",
        emailLabel: "Email",
        emailHint: "Nu îl vom distribui niciodată.",
        placeholderEmail: "tu@example.com",
        emailError: "Introdu o adresă de email validă.",
        displayNameLabel: "Nume afișat",
        placeholderDisplayName: "Jane Doe",
      },
      sheet: {
        quickActions: "Acțiuni rapide",
        dynamicBody:
          "Foaia se dimensionează automat după conținut. Trage în jos sau atinge fundalul pentru închidere.",
        filters: "Filtre",
        fixedBody:
          "Snap points fixe. Trage mânerul în sus pentru extindere, în jos pentru restrângere sau închidere.",
        customBadge: "Custom",
        customHeader: "Orice încape aici",
        customBody:
          "Când `header` este ReactNode, wrapperul îl randază ca atare - fără buton de închidere inclus; compui ce ai nevoie.",
      },
    },
  },
} as const satisfies Record<SupportedLocale, MessageTree>;

export type MobileMessageKey = LeafPath<(typeof mobileMessages)["en"]>;

export type MobileFormatter = Omit<Formatter, "format" | "has"> & {
  format(key: MobileMessageKey, values?: InterpolationValues): string;
  has(key: MobileMessageKey): boolean;
};

const formatterOptions = {
  catalogs: mobileMessages as CatalogsByLocale,
  fallback: fallbackLocale,
} satisfies FormatterOptions;

export function createMobileFormatter(
  locale: string | null | undefined,
): MobileFormatter {
  const formatter = createFormatter(locale, formatterOptions);

  return {
    locale: formatter.locale,
    fallbackLocale: formatter.fallbackLocale,
    format(key, values) {
      return formatter.format(key as MessageKey, values);
    },
    has(key) {
      return formatter.has(key as MessageKey);
    },
  };
}

export function formatMobileMessage(
  locale: string | null | undefined,
  key: MobileMessageKey,
  values?: InterpolationValues,
): string {
  return createMobileFormatter(locale).format(key, values);
}

type LeafPath<T> = {
  [Key in Extract<keyof T, string>]: T[Key] extends string
    ? Key
    : T[Key] extends Readonly<Record<string, unknown>>
      ? `${Key}.${LeafPath<T[Key]>}`
      : never;
}[Extract<keyof T, string>];
