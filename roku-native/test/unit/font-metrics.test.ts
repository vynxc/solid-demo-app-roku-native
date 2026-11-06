import { describe, expect, it, vi } from "vitest";

vi.mock("@roku-sdk/solid", () => ({
  createElement: () => ({}),
  insertNode: () => {},
  setProp: () => {},
}));
vi.mock("@roku-sdk/rsg-ts/runtime", () => ({
  getFontMeasure: () => null,
  whenFontReady: () => Promise.resolve(),
}));

import { FONT_METRICS, measureMsdf } from "../../src/roku/font-metrics";
import { webLineHeight } from "../../src/roku/fonts";

describe("MSDF layout metrics", () => {
  const roboto = FONT_METRICS["pkg:/fonts/Roboto-Regular.ttf"];

  it("sums advances and applies pair kerning like the web renderer", () => {
    const av = measureMsdf(roboto, "AV");
    expect(av).toBeCloseTo(27.398438 + 26.72168 - 1.78418, 3);
    expect(measureMsdf(roboto, "")).toBe(0);
  });

  it("skips characters with no glyph and resets the kerning context", () => {
    const width = measureMsdf(roboto, "A\u{10FFFF}V");
    expect(width).toBeCloseTo(27.398438 + 26.72168, 3);
  });

  it("has the three native faces used by the host", () => {
    expect(FONT_METRICS["pkg:/fonts/Roboto-Regular.ttf"]).toBeTruthy();
    expect(FONT_METRICS["pkg:/fonts/Roboto-Bold.ttf"]).toBeTruthy();
    expect(FONT_METRICS["pkg:/fonts/Raleway-ExtraBold.ttf"]).toBeTruthy();
  });
});

describe("web line-box ratios", () => {
  it("matches the shared app's Roboto metric overrides", () => {
    // src/fonts.ts overrides Roboto to ascender 1000 / descender 100 /
    // unitsPerEm 1000, so its natural line box is 0.9 x fontSize. The
    // renderer default lineHeight of 1.2 then gives 25.92 px at 24.
    expect(webLineHeight("Roboto", 400, 24)).toBeCloseTo(21.6, 4);
    expect(1.2 * webLineHeight("Roboto", 400, 24)).toBeCloseTo(25.92, 4);
    expect(webLineHeight("Roboto", 700, 18)).toBeCloseTo(16.2, 4);
  });

  it("uses Raleway's own metrics", () => {
    expect(webLineHeight("Raleway", "bold", 24)).toBeCloseTo(28.176, 4);
  });
});
