import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import * as Localization from "expo-localization";
import { normalizeLocaleTag, type SupportedLocale } from "@repo/i18n";
import { createMobileFormatter, type MobileFormatter } from "./messages";
import {
  resolveMobileLocale,
  type MobileDeviceLocale,
} from "./resolve-locale";

export type LocaleContextValue = {
  locale: SupportedLocale;
  manualLocale: SupportedLocale | null;
  isLoading: boolean;
  setLocale(locale: SupportedLocale): Promise<void>;
  clearLocalePreference(): Promise<void>;
  formatter: MobileFormatter;
  t: MobileFormatter["format"];
};

export type TranslationContextValue = Pick<
  LocaleContextValue,
  "formatter" | "locale" | "t"
>;

export type LocaleProviderProps = {
  children: ReactNode;
};

export const manualLocaleStorageKey = "@dectech/mobile/locale";

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: LocaleProviderProps) {
  const [manualLocale, setManualLocaleState] =
    useState<SupportedLocale | null>(null);
  const [deviceLocales, setDeviceLocales] = useState<MobileDeviceLocale[]>(
    readDeviceLocales,
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadManualLocale() {
      try {
        const storedLocale = await AsyncStorage.getItem(manualLocaleStorageKey);

        if (isMounted) {
          setManualLocaleState(normalizeLocaleTag(storedLocale));
        }
      } catch {
        if (isMounted) {
          setManualLocaleState(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadManualLocale();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        setDeviceLocales(readDeviceLocales());
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const locale = useMemo(
    () => resolveMobileLocale(manualLocale, deviceLocales),
    [deviceLocales, manualLocale],
  );

  const formatter = useMemo(() => createMobileFormatter(locale), [locale]);

  const setLocale = useCallback(async (nextLocale: SupportedLocale) => {
    setManualLocaleState(nextLocale);
    try {
      await AsyncStorage.setItem(manualLocaleStorageKey, nextLocale);
    } catch {
      // Keep the in-memory preference even if persistence is unavailable.
    }
  }, []);

  const clearLocalePreference = useCallback(async () => {
    setManualLocaleState(null);
    try {
      await AsyncStorage.removeItem(manualLocaleStorageKey);
    } catch {
      // The in-memory value is already cleared; retry on the next manual change.
    }
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      manualLocale,
      isLoading,
      setLocale,
      clearLocalePreference,
      formatter,
      t: formatter.format,
    }),
    [
      clearLocalePreference,
      formatter,
      isLoading,
      locale,
      manualLocale,
      setLocale,
    ],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);

  if (context === null) {
    throw new Error("useLocale must be used within LocaleProvider");
  }

  return context;
}

export function useTranslation(): TranslationContextValue {
  const { locale, t, formatter } = useLocale();

  return { locale, t, formatter };
}

function readDeviceLocales(): MobileDeviceLocale[] {
  try {
    return Localization.getLocales().map((locale) => ({
      languageCode: locale.languageCode,
      languageTag: locale.languageTag,
    }));
  } catch {
    return [];
  }
}
