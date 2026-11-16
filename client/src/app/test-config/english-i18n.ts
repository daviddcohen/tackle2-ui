/**
 * A `react-i18next` stand-in that renders the English strings with i18next
 * interpolation and `_one`/`_other` plurals, for tests that assert copy (the
 * default mock returns keys). Use it with
 * `jest.mock("react-i18next", () => jest.requireActual("@app/test-config/english-i18n"));`
 */
import en from "../../../public/locales/en/translation.json";

type Strings = { [key: string]: string | Strings };

export const englishT = (
  key: string,
  values: Record<string, unknown> = {}
): string => {
  const path = key.split(".");
  const leaf = path.pop() as string;
  const parent = path.reduce<Strings | undefined>(
    (node, part) => node?.[part] as Strings | undefined,
    en as Strings
  );
  const count = values.count;
  const plural =
    typeof count === "number"
      ? parent?.[`${leaf}_${count === 1 ? "one" : "other"}`]
      : undefined;
  const text = plural ?? parent?.[leaf];
  if (typeof text !== "string") return key;
  return text.replace(/{{\s*(\w+)\s*}}/g, (_, name: string) =>
    String(values[name])
  );
};

export const useTranslation = () => ({ t: englishT });
