import { describe, expect, it, vi } from "vitest";

// effects.ts touches the SceneGraph runtime only when a RokuEffect is
// constructed; colour conversion is pure. Stub the runtime so the pure
// mapping can be tested off-device.
vi.mock("@roku-sdk/solid", () => ({
  createElement: () => ({}),
  setProp: () => {},
}));

import { toRokuColor } from "../../src/roku/effects";

describe("toRokuColor", () => {
  it("normalises packed numbers to 0xAARRGGBB", () => {
    expect(toRokuColor(0x182b44ff)).toBe("0x182B44FF");
    expect(toRokuColor(0)).toBe("0x00000000");
  });

  it("expands CSS short and long hex", () => {
    expect(toRokuColor("#112233")).toBe("0x112233FF");
    expect(toRokuColor("#11223344")).toBe("0x11223344");
    expect(toRokuColor("#fff")).toBe("0xFFFFFFFF");
    expect(toRokuColor("#333")).toBe("0x333333FF");
    expect(toRokuColor("#3338")).toBe("0x33333388");
  });

  it("accepts RGBA objects and colour getters", () => {
    expect(toRokuColor({ r: 255, g: 0, b: 0, a: 1 })).toBe("0xFF0000FF");
    expect(toRokuColor({ r: 0, g: 1, b: 0, a: 0.5 })).toBe("0x00FF007F");
    expect(toRokuColor(() => 0x11223344)).toBe("0x11223344");
  });

  it("uses the supplied fallback for unknown values", () => {
    expect(toRokuColor(undefined, "0xFFFFFFFF")).toBe("0xFFFFFFFF");
    expect(toRokuColor(null, "0xFFFFFFFF")).toBe("0xFFFFFFFF");
    expect(toRokuColor("not-a-colour", "0xFFFFFFFF")).toBe("0xFFFFFFFF");
  });

  it("preserves already-formatted 0x strings", () => {
    expect(toRokuColor("0x11223344")).toBe("0x11223344");
    expect(toRokuColor("0X11223344")).toBe("0X11223344");
  });
});
