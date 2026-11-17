import { getBasePath, getRouterBasename, withBasePath } from "./base-path";

const setBaseHref = (href: string | null) => {
  document.head.querySelectorAll("base").forEach((base) => base.remove());
  if (href !== null) {
    const base = document.createElement("base");
    base.href = href;
    document.head.prepend(base);
  }
};

afterEach(() => setBaseHref(null));

describe("base path helpers", () => {
  it("defaults to the origin root without a <base> element", () => {
    expect(getBasePath()).toBe("/");
    expect(getRouterBasename()).toBe("");
    expect(withBasePath("mockServiceWorker.js")).toBe("/mockServiceWorker.js");
  });

  it("returns the root for <base href='/'>", () => {
    setBaseHref("/");
    expect(getBasePath()).toBe("/");
    expect(getRouterBasename()).toBe("");
    expect(withBasePath("locales/en/translation.json")).toBe(
      "/locales/en/translation.json"
    );
  });

  it("follows a subpath <base href>", () => {
    setBaseHref("/tackle2-ui/");
    expect(getBasePath()).toBe("/tackle2-ui/");
    expect(getRouterBasename()).toBe("/tackle2-ui");
    expect(withBasePath("mockServiceWorker.js")).toBe(
      "/tackle2-ui/mockServiceWorker.js"
    );
  });
});
