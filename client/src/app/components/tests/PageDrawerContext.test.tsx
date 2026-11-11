import { focusDrawerHead } from "../PageDrawerContext";

const drawerHead = (html: string) => {
  const head = document.createElement("span");
  head.tabIndex = -1;
  head.innerHTML = html;
  document.body.appendChild(head);
  return head;
};

describe("focusDrawerHead", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("focuses the drawer's title when its head has one", () => {
    const head = drawerHead(
      '<small>Archetype</small><h2 id="title">Spring Boot Application</h2>'
    );
    focusDrawerHead(head);
    const title = head.querySelector("#title");
    expect(document.activeElement).toBe(title);
    expect(title).toHaveAttribute("tabindex", "-1");
  });

  it("focuses the whole head when it has no title", () => {
    const head = drawerHead("<small>Archetype</small><p>No heading</p>");
    focusDrawerHead(head);
    expect(document.activeElement).toBe(head);
  });

  it("does nothing without a head", () => {
    expect(() => focusDrawerHead(null)).not.toThrow();
    expect(document.activeElement).toBe(document.body);
  });
});
