/**
 * A `react-i18next` stand-in that renders the English strings with i18next
 * interpolation and `_zero`/`_one`/`_other` plurals, and a `Trans` with named tags,
 * for tests that assert copy (the default mock returns keys). Use it with
 * `jest.mock("react-i18next", () => jest.requireActual("@app/test-config/english-i18n"));`
 */
import * as React from "react";

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
      ? ((count === 0 ? parent?.[`${leaf}_zero`] : undefined) ??
        parent?.[`${leaf}_${count === 1 ? "one" : "other"}`])
      : undefined;
  const text = plural ?? parent?.[leaf];
  if (typeof text !== "string") return key;
  return text.replace(/{{\s*(\w+)\s*(, list)?}}/g, (_, name: string, list) =>
    list && Array.isArray(values[name])
      ? new Intl.ListFormat("en").format(values[name] as string[])
      : String(values[name])
  );
};

export const useTranslation = () => ({ t: englishT });

/**
 * Tag names react-i18next parses as HTML void elements (lower case only:
 * `<Link>` is fine): `<link>x</link>` renders an empty element followed by
 * "x", so a Trans key must not use them as named tags.
 */
const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/**
 * A `Trans` that renders the English string and puts each named tag's text
 * in the component given for that tag (`components={{ nameLink: <Link /> }}`),
 * as react-i18next does: a self-closing tag (`<heading/>`) renders its
 * component as given, children included; a void tag name renders an empty
 * component followed by its text. A tag without a component keeps its text
 * only.
 */
export const transNodes = (
  text: string,
  components: Record<string, React.ReactElement> = {}
) =>
  text.split(/(<\w+\/>|<\w+>.*?<\/\w+>)/).flatMap((part, index) => {
    const selfClosing = /^<(\w+)\/>$/.exec(part);
    if (selfClosing != null) {
      const component = components[selfClosing[1]];
      return component != null
        ? [React.cloneElement(component, { key: index })]
        : [];
    }
    const tag = /^<(\w+)>(.*)<\/\1>$/.exec(part);
    if (tag == null) return [part];
    const component = components[tag[1]];
    if (component == null) return [tag[2]];
    if (VOID_TAGS.has(tag[1])) {
      return [React.cloneElement(component, { key: index }, null), tag[2]];
    }
    return [React.cloneElement(component, { key: index }, tag[2])];
  });

export const Trans = ({
  i18nKey,
  values,
  components = {},
}: {
  i18nKey: string;
  values?: Record<string, unknown>;
  components?: Record<string, React.ReactElement>;
}) => transNodes(englishT(i18nKey, values), components);
