import { afterEach, describe, expect, it, vi } from "vitest";

const tasks: any[] = [];

vi.mock("@roku-sdk/solid", () => ({
  createElement: (tag: string) => {
    const node: any = { tag, children: [], parent: null };
    tasks.push(node);
    return node;
  },
  setProp: (node: any, name: string, value: any) => {
    node[name] = value;
  },
  insertNode: (parent: any, node: any) => {
    parent.children.push(node);
    node.parent = parent;
  },
  tmTransaction: {
    removeNode: (parent: any, node: any) => {
      const i = parent.children.indexOf(node);
      if (i >= 0) parent.children.splice(i, 1);
      node.parent = null;
    },
  },
}));

import { postRokuTask } from "../../src/roku/worker-task";

const parent = { tag: "root", children: [] };

afterEach(() => {
  tasks.length = 0;
  parent.children.length = 0;
  vi.useRealTimers();
});

describe("postRokuTask", () => {
  it("starts a WorkerTask and resolves its response", async () => {
    const handle = postRokuTask<number>({ op: "echo", value: 42 }, { parent });
    const task = tasks[0];
    expect(task.tag).toBe("WorkerTask");
    expect(task.control).toBe("RUN");
    expect(task.request).toEqual({ op: "echo", value: 42 });
    task.onResponse({ ok: true, result: 42 });
    await expect(handle.result).resolves.toBe(42);
    expect(task.control).toBe("STOP");
    expect(parent.children).toHaveLength(0);
  });

  it("rejects a failed worker response", async () => {
    const handle = postRokuTask({ op: "sleep", ms: 1 }, { parent });
    const task = tasks[0];
    task.onResponse({ ok: false, error: "boom" });
    await expect(handle.result).rejects.toThrow("boom");
  });

  it("supports cancellation and timeouts", async () => {
    vi.useFakeTimers();
    const cancelled = postRokuTask({ op: "sleep", ms: 1 }, { parent, timeoutMs: 50 });
    cancelled.cancel();
    await expect(cancelled.result).rejects.toThrow("cancelled");

    const timedOut = postRokuTask({ op: "sleep", ms: 1 }, { parent, timeoutMs: 100 });
    vi.advanceTimersByTime(101);
    await expect(timedOut.result).rejects.toThrow("timed out");
  });

  it("rejects when there is no SceneGraph root", async () => {
    const handle = postRokuTask({ op: "echo", value: 1 }, {});
    await expect(handle.result).rejects.toThrow("no SceneGraph root");
  });
});
