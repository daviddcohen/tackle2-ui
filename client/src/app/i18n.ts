import { default as i18n } from "i18next";
import Backend from "i18next-http-backend";
import { initReactI18next } from "react-i18next";

i18n
  .use(Backend)
  .use(initReactI18next)
  .init({
    lng: "en",
    fallbackLng: "en",
    debug: false,
    react: {
      useSuspense: false,
    },
    interpolation: {
      escapeValue: false,
    },

    returnEmptyString: false,

    // Relative, so it resolves against <base href> under any base path.
    backend: {
      loadPath: "locales/{{lng}}/{{ns}}.json",
    },
  });

export default i18n;
