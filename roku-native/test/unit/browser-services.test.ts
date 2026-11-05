import { beforeAll, describe, expect, it } from "vitest";
import {
  RokEvent,
  RokSearchParams,
  RokURL,
  dispatchNativeKey,
  installBrowserServices,
  isKeyHandled,
} from "../../src/roku/browser-services";

describe("RokSearchParams", () => {
  it("parses, updates and serialises query strings", () => {
    const params = new RokSearchParams("?a=1&b=two&a=3");
    expect(params.get("a")).toBe("1");
    expect(params.getAll("a")).toEqual(["1", "3"]);
    expect(params.has("b")).toBe(true);
    params.set("b", "updated value");
    params.append("c", "x&y");
    expect(params.get("b")).toBe("updated value");
    expect(params.toString()).toBe("a=1&a=3&b=updated%20value&c=x%26y");
    params.delete("a");
    expect(params.has("a")).toBe(false);
  });

  it("iterates entries/keys/values/forEach", () => {
    const params = new RokSearchParams({ one: "1", two: "2" });
    expect([...params.keys()]).toEqual(["one", "two"]);
    expect([...params.values()]).toEqual(["1", "2"]);
    expect([...params.entries()]).toEqual([
      ["one", "1"],
      ["two", "2"],
    ]);
    const seen: string[] = [];
    params.forEach((value, key) => seen.push(`${key}=${value}`));
    expect(seen).toEqual(["one=1", "two=2"]);
  });
});

describe("RokURL", () => {
  it("parses absolute and relative hashes", () => {
    const abs = new RokURL("https://roku.local/app/path?x=1#/examples");
    expect(abs.protocol).toBe("https:");
    expect(abs.host).toBe("roku.local");
    expect(abs.pathname).toBe("/app/path");
    expect(abs.search).toBe("?x=1");
    expect(abs.hash).toBe("#/examples");
    expect(abs.searchParams.get("x")).toBe("1");

    const rel = new RokURL("/path?y=2#/text", "https://roku.local/");
    expect(rel.href).toBe("https://roku.local/path?y=2#/text");
    expect(rel.pathname).toBe("/path");
    expect(rel.hash).toBe("#/text");
  });
});

describe("RokEvent / native key bridge", () => {
  const firmwareCalls: any[] = [];
  let requests: any[] = [];

  beforeAll(() => {
    (globalThis as any).fetch = (input: any) => {
      firmwareCalls.push(input);
      return Promise.resolve({ json: async () => ({}) });
    };
    (globalThis as any).Request = class Request {
      constructor(
        public input: any,
        public init: any,
      ) {
        requests.push(this);
      }
    };
    installBrowserServices();
  });

  it("forwards fetch init as a Request so headers survive the one-arg firmware fetch", async () => {
    requests = [];
    const headers = { Authorization: "Bearer test" };
    await (globalThis as any).fetch("https://api.example/1", { headers });
    expect(requests).toHaveLength(1);
    expect(requests[0].input).toBe("https://api.example/1");
    expect(requests[0].init.headers).toEqual(headers);
    expect(firmwareCalls.at(-1)).toBe(requests[0]);
  });

  it("maps Roku keys to the DOM names the shared app handles", () => {
    const events: any[] = [];
    const doc = (globalThis as any).document;
    const listener = (event: any) => events.push(event);
    doc.addEventListener("keydown", listener);
    doc.addEventListener("keyup", listener);
    expect(dispatchNativeKey("Info", true)).toBe(false);
    expect(events.at(-1).key).toBe("m");
    expect(events.at(-1).keyCode).toBe(77);
    expect(dispatchNativeKey("Down", true)).toBe(false);
    expect(events.at(-1).key).toBe("ArrowDown");
    expect(events.at(-1).keyCode).toBe(40);
    expect(dispatchNativeKey("Down", false)).toBe(false);
    expect(events.at(-1).type).toBe("keyup");
    doc.removeEventListener("keydown", listener);
    doc.removeEventListener("keyup", listener);
    expect(isKeyHandled()).toBe(false);
  });

  it("marks auto-repeat presses", () => {
    const events: any[] = [];
    const doc = (globalThis as any).document;
    const listener = (event: any) => events.push(event);
    doc.addEventListener("keydown", listener);
    dispatchNativeKey("Right", true);
    dispatchNativeKey("Right", true);
    dispatchNativeKey("Right", false);
    expect(events.map((e) => e.repeat)).toEqual([false, true]);
    doc.removeEventListener("keydown", listener);
  });

  it("lets an app handler consume a key", () => {
    const doc = (globalThis as any).document;
    const listener = (event: any) => {
      event.preventDefault();
      return true;
    };
    doc.addEventListener("keydown", listener);
    expect(dispatchNativeKey("Enter", true)).toBe(true);
    expect(isKeyHandled()).toBe(true);
    dispatchNativeKey("Enter", false);
    doc.removeEventListener("keydown", listener);
  });

  it("creates DOM-like events", () => {
    const event = new RokEvent("hashchange");
    expect(event.type).toBe("hashchange");
    expect(event.bubbles).toBe(false);
  });
});
