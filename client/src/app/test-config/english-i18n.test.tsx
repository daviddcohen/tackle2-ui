import * as React from "react";
import { render } from "@testing-library/react";

import en from "../../../public/locales/en/translation.json";

import { Trans, englishT, transNodes } from "./english-i18n";

type Strings = { [key: string]: string | Strings };

const VOID_TAG =
  /<\/?(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)>/;

const leaves = (node: Strings, prefix = ""): [string, string][] =>
  Object.entries(node).flatMap(([key, value]) =>
    typeof value === "string"
      ? [[`${prefix}${key}`, value] as [string, string]]
      : leaves(value, `${prefix}${key}.`)
  );

describe("english-i18n", () => {
  it("uses no HTML void element name as a Trans tag", () => {
    // react-i18next renders <link>x</link> as an empty element, then "x".
    const offending = leaves(en as Strings).filter(([, text]) =>
      VOID_TAG.test(text)
    );
    expect(offending).toEqual([]);
  });

  it("renders a void tag name the way react-i18next does", () => {
    const { container } = render(
      <>
        {transNodes("Agent: <link>Code Migrator</link>", {
          link: <a href="/agents/2" />,
        })}
      </>
    );
    // An empty anchor, then the name as plain text.
    expect(container.querySelector("a")?.textContent).toBe("");
    expect(container.textContent).toBe("Agent: Code Migrator");
  });

  it("puts a named tag's text in its component", () => {
    const { container } = render(
      <>
        {Trans({
          i18nKey: "agentic.stageSkills.origin.agent",
          values: { name: "Code Migrator" },
          components: { nameLink: <a href="/agents/2" /> },
        })}
      </>
    );
    expect(container.querySelector("a")?.textContent).toBe("Code Migrator");
  });

  it("keeps a self-closing tag's own children, and counts zero", () => {
    const { container } = render(
      <>
        {transNodes("<heading/> (2)", {
          heading: <strong>Application skills</strong>,
        })}
      </>
    );
    expect(container.textContent).toBe("Application skills (2)");
    expect(englishT("agentic.stageSkills.summary", { count: 0 })).toBe(
      "No skills"
    );
  });
});
