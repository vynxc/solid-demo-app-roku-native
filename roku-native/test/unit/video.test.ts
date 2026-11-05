import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Minimal SceneGraph node graph so the video adapter can be exercised
// off-device. `setProp` behaves like an observable field, event handlers are
// plain functions callable by the test.
const nodes: any[] = [];
let removed: any[] = [];

vi.mock("@roku-sdk/solid", () => ({
  createElement: (tag: string) => {
    const node: any = { tag, children: [], parent: null };
    nodes.push(node);
    return node;
  },
  setProp: (node: any, name: string, value: any) => {
    node[name] = value;
  },
  insertNode: (parent: any, node: any) => {
    if (node.parent) {
      const i = node.parent.children.indexOf(node);
      if (i >= 0) node.parent.children.splice(i, 1);
    }
    parent.children.push(node);
    node.parent = parent;
  },
  tmTransaction: {
    removeNode: (parent: any, node: any) => {
      const i = parent.children.indexOf(node);
      if (i >= 0) parent.children.splice(i, 1);
      node.parent = null;
      removed.push(node);
    },
  },
}));

import * as player from "../../src/roku/video";

const root = { tag: "root", children: [] };
const videoNode = () => nodes.find((n) => n.tag === "video");
const contentNode = () => nodes.find((n) => n.tag === "contentNode");

beforeEach(() => {
  nodes.length = 0;
  removed = [];
  (globalThis as any).__solidtvNativeRoot = root;
  root.children.length = 0;
});

afterEach(async () => {
  await player.destroy();
});

describe("Roku video adapter", () => {
  it("creates the Video/Content/backdrop nodes and attaches them", async () => {
    await player.init();
    expect(videoNode()).toBeTruthy();
    expect(contentNode()).toBeTruthy();
    expect(root.children.some((n: any) => n.tag === "video")).toBe(true);
    expect(videoNode().enableUI).toBe(false);
    expect(videoNode().width).toBe(1920);
  });

  it("loads a stream when the node reports playing or paused", async () => {
    await player.init();
    const loading = player.load({ streamUrl: "https://example/stream.m3u8" });
    expect(contentNode().url).toBe("https://example/stream.m3u8");
    videoNode().onState("playing");
    await expect(loading).resolves.toBeUndefined();
    expect(player.state.playingState).toBe(true);
  });

  it("plays, pauses and seeks through the SceneGraph control field", async () => {
    await player.init();
    player.play();
    expect(videoNode().control).toBe("play");
    expect(player.state.playingState).toBe(true);
    player.pause();
    expect(videoNode().control).toBe("pause");
    expect(player.state.playingState).toBe(false);
    player.seek(42);
    expect(videoNode().seek).toBe(42);
    player.seek(Number.NaN);
    expect(videoNode().seek).toBe(0);
  });

  it("formats the native position and duration", async () => {
    await player.init();
    videoNode().onPosition(65000);
    videoNode().onDuration(125000);
    expect(player.getCurrentTime()).toBeCloseTo(65);
    expect(player.getVideoDuration()).toBeCloseTo(125);
    expect(player.getTimeFormat()).toBe("1:05 : 2:05");
  });

  it("maps media keys, including seek clamping", async () => {
    await player.init();
    videoNode().onPosition(5000);
    videoNode().onDuration(60000);
    expect(player.handleMediaKey("fwd")).toBe(true);
    expect(videoNode().seek).toBe(15);
    videoNode().onPosition(15000);
    expect(player.handleMediaKey("rev")).toBe(true);
    expect(videoNode().seek).toBe(5);
    expect(player.handleMediaKey("unknown")).toBe(false);
  });

  it("stops and detaches on destroy", async () => {
    await player.init();
    await player.destroy();
    expect(root.children.some((n: any) => n.tag === "video")).toBe(false);
    expect(player.state.playingState).toBe(false);
    expect(player.getCurrentTime()).toBe(0);
  });
});
