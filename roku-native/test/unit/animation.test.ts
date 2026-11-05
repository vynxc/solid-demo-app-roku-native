import { describe, expect, it } from "vitest";
import { Animation, AnimationController, Animator, isColorKey, lerpColor } from "../../src/roku/animation";

describe("lerpColor", () => {
  it("interpolates each RGBA channel and keeps alpha", () => {
    const mid = lerpColor(0x182b44ff, 0xffffffff, 0.5);
    expect(mid).toBe(0x8c95a2ff);
  });

  it("interpolates alpha too", () => {
    expect(lerpColor(0x11223300, 0x445566ff, 1)).toBe(0x445566ff);
    expect(lerpColor(0x11223300, 0x445566ff, 0)).toBe(0x11223300);
  });

  it("recognises only colour props", () => {
    expect(isColorKey("color")).toBe(true);
    expect(isColorKey("colorTopLeft")).toBe(true);
    expect(isColorKey("alpha")).toBe(false);
    expect(isColorKey("x")).toBe(false);
  });
});

describe("Animation", () => {
  it("ticks a numeric interpolation and finishes", () => {
    const a = new Animation({ value: 0, target: 100, duration: 100 });
    expect(a.running).toBe(false);
    a.start();
    expect(a.running).toBe(true);
    a.tick(50);
    expect(a.value).toBeCloseTo(50);
    expect(a.running).toBe(true);
    a.tick(50);
    expect(a.value).toBeCloseTo(100);
    expect(a.running).toBe(false);
  });

  it("loops and repeats", () => {
    const a = new Animation({ value: 0, target: 10, duration: 10, loop: true });
    a.start();
    a.tick(5);
    a.tick(5);
    // At the loop boundary the value resets to the initial frame immediately.
    expect(a.value).toBeCloseTo(0);
    expect(a.running).toBe(true); // looped
    a.tick(5);
    expect(a.value).toBeCloseTo(5);
    const b = new Animation({ value: 0, target: 10, duration: 10, repeat: 1 });
    b.start();
    b.tick(10);
    expect(b.running).toBe(true); // one repeat remains
    b.tick(10);
    expect(b.running).toBe(false);
  });

  it("uses a map for colour progress", () => {
    const a = new Animation({
      value: 0,
      target: 1,
      duration: 10,
      map: (p) => lerpColor(0x000000ff, 0xffffffff, p),
    });
    a.start();
    a.tick(5);
    expect(a.value).toBe(0x808080ff);
  });
});

describe("AnimationController / Animator", () => {
  it("resolves waitUntilStopped when finished", async () => {
    const a = new Animation({ value: 0, target: 1, duration: 10 });
    const c = new AnimationController([a]);
    const p = c.waitUntilStopped();
    c.start();
    a.tick(10);
    await expect(p).resolves.toBeUndefined();
    expect(c.state).toBe("stopped");
  });

  it("writes colours through the animator", () => {
    const node: any = { color: 0x182b44ff, requestRender() {} };
    const animator = new Animator();
    const c = animator.create(node, { color: 0xffffffff }, { duration: 100 }, () => {});
    c.start();
    animator.tick(50);
    expect(node.color).not.toBe(0x182b44ff);
    expect(node.color).not.toBe(0xffffffff);
    animator.tick(100);
    expect(node.color).toBe(0xffffffff);
    expect(animator.running).toBe(false);
  });
});
