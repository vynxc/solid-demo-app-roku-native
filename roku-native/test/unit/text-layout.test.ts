import { describe, expect, it } from "vitest";
import { layoutText } from "../../src/roku/text-layout";

const measure = (s: string) => s.length * 10;

const base = {
  measure,
  naturalLineHeight: 32,
  fontSize: 32,
  lineHeight: 1.2,
  maxWidth: 0,
  maxHeight: 0,
  maxLines: 0,
  textAlign: "left" as const,
  verticalAlign: "top" as const,
  contain: "none" as const,
  wordBreak: "break-word" as const,
  overflowSuffix: "...",
  letterSpacing: 0,
  offsetY: 0,
  rtl: false,
};

describe("layoutText", () => {
  it("auto-sizes a single line", () => {
    const out = layoutText({ ...base, text: "hello world" });
    expect(out.lines.map((l) => l.text)).toEqual(["hello world"]);
    expect(out.width).toBe(110);
    expect(out.labelW).toBe(110);
    expect(out.lineHeightPx).toBeCloseTo(38.4);
    expect(out.height).toBeCloseTo(38.4);
    expect(out.truncated).toBe(false);
  });

  it("wraps at word boundaries when width-constrained", () => {
    const out = layoutText({ ...base, text: "aaaa bbbb", maxWidth: 50, contain: "width" });
    expect(out.lines.map((l) => l.text)).toEqual(["aaaa", "bbbb"]);
    expect(out.boxW).toBe(50);
  });

  it("honours explicit newlines", () => {
    const out = layoutText({ ...base, text: "a\nbb\nccc" });
    expect(out.lines.map((l) => l.text)).toEqual(["a", "bb", "ccc"]);
    expect(out.width).toBe(30);
    expect(out.height).toBeCloseTo(38.4 * 3);
  });

  it("truncates with maxLines and the overflow suffix", () => {
    const out = layoutText({ ...base, text: "one two three", maxWidth: 50, contain: "width", maxLines: 1 });
    expect(out.truncated).toBe(true);
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0].text.endsWith("...")).toBe(true);
    expect(out.lines[0].width).toBeLessThanOrEqual(50);
  });

  it("treats lineHeight > 3 as pixels and <= 3 as a multiplier", () => {
    const px = layoutText({ ...base, text: "x", lineHeight: 40 });
    expect(px.lineHeightPx).toBe(40);
    const mult = layoutText({ ...base, text: "x", lineHeight: 1.5, fontSize: 20 });
    expect(mult.lineHeightPx).toBe(30);
  });

  it("centres the block for verticalAlign middle", () => {
    const out = layoutText({
      ...base,
      text: "one line",
      maxHeight: 100,
      contain: "both",
      verticalAlign: "middle",
    });
    expect(out.boxH).toBe(100);
    expect(out.boxY).toBeCloseTo((100 - out.height) / 2);
  });

  it("adds letter spacing to measured widths", () => {
    const plain = layoutText({ ...base, text: "abcd" });
    const spaced = layoutText({ ...base, text: "abcd", letterSpacing: 5 });
    expect(spaced.width).toBe(plain.width + 3 * 5);
  });
});

describe("layoutText edge cases", () => {
  it("breaks long words when wordBreak is break-all", () => {
    const out = layoutText({
      ...base,
      text: "abcdef",
      maxWidth: 30,
      contain: "width",
      wordBreak: "break-all",
    });
    expect(out.lines.map((l) => l.text)).toEqual(["abc", "def"]);
  });

  it("lets an unbreakable word overflow when wordBreak is overflow", () => {
    const out = layoutText({
      ...base,
      text: "abcdefgh",
      maxWidth: 30,
      contain: "width",
      wordBreak: "overflow",
    });
    expect(out.lines[0].text).toBe("abcdefgh");
    expect(out.lines[0].width).toBe(80);
  });

  it("derives maxLines from maxHeight when contain is height", () => {
    const out = layoutText({
      ...base,
      text: "aaaa bbbb cccc dddd",
      maxWidth: 50,
      maxHeight: 76.8,
      contain: "both",
    });
    expect(out.effectiveMaxLines).toBe(2);
    expect(out.lines).toHaveLength(2);
    expect(out.truncated).toBe(true);
  });

  it("bottom-aligns, then applies offsetY", () => {
    const out = layoutText({
      ...base,
      text: "one line",
      maxHeight: 100,
      contain: "both",
      verticalAlign: "bottom",
      offsetY: 7,
    });
    expect(out.boxY).toBeCloseTo(100 - out.height + 7);
  });

  it("mirrors left/right alignment for RTL text", () => {
    const ltr = layoutText({
      ...base,
      text: "abc",
      maxWidth: 100,
      contain: "width",
      textAlign: "left",
    });
    const rtl = layoutText({
      ...base,
      text: "abc",
      maxWidth: 100,
      contain: "width",
      textAlign: "left",
      rtl: true,
    });
    expect(ltr.boxX).toBe(0);
    expect(rtl.boxX).toBe(70);
  });
});
