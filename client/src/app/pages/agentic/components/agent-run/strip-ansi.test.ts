import { stripAnsi } from "./strip-ansi";

describe("stripAnsi", () => {
  it("removes color codes and keeps the text", () => {
    expect(
      stripAnsi("[\u001b[1;36mINFO\u001b[m] BUILD \u001b[32mSUCCESS\u001b[0m")
    ).toBe("[INFO] BUILD SUCCESS");
  });

  it("removes cursor moves, OSC titles and links", () => {
    expect(stripAnsi("\u001b[2K\u001b[1Gdone")).toBe("done");
    expect(stripAnsi("\u001b]0;title\u0007text")).toBe("text");
    expect(
      stripAnsi("\u001b]8;;https://example.com\u001b\\link\u001b]8;;\u001b\\")
    ).toBe("link");
  });

  it("leaves text without escapes as it is", () => {
    expect(stripAnsi("[INFO] a [b] c\nnext line")).toBe(
      "[INFO] a [b] c\nnext line"
    );
  });
});
