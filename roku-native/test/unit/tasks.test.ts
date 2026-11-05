import { describe, expect, it } from "vitest";
import { CooperativeTaskQueue, postTask, taskQueue, yieldToUI } from "../../src/roku/tasks";

describe("CooperativeTaskQueue", () => {
  it("runs higher priorities first and preserves FIFO within a priority", async () => {
    const queue = new CooperativeTaskQueue({ sliceMs: 1000 });
    const order: string[] = [];
    queue.post(() => order.push("low"), { priority: 0 });
    queue.post(() => order.push("high-1"), { priority: 10 });
    queue.post(() => order.push("high-2"), { priority: 10 });
    await queue.flush();
    expect(order).toEqual(["high-1", "high-2", "low"]);
  });

  it("yields after the time slice and resumes later", async () => {
    let clock = 0;
    const scheduled: Array<() => void> = [];
    const queue = new CooperativeTaskQueue({
      sliceMs: 5,
      now: () => clock,
      schedule: (fn) => {
        scheduled.push(fn);
        return fn;
      },
      cancel: () => {},
    });
    const order: string[] = [];
    const jobs = [
      queue.post(() => {
        order.push("one");
        clock += 4;
      }),
      queue.post(() => {
        order.push("two");
        clock += 4;
      }),
      queue.post(() => {
        order.push("three");
        clock += 4;
      }),
    ];
    // First scheduled drain runs until the 5ms slice is exhausted.
    scheduled.shift()!();
    expect(order).toEqual(["one", "two"]);
    expect(scheduled).toHaveLength(1);
    scheduled.shift()!();
    await Promise.all(jobs);
    expect(order).toEqual(["one", "two", "three"]);
  });

  it("rejects a cancelled job without running it", async () => {
    const queue = new CooperativeTaskQueue({ sliceMs: 1000 });
    const controller = new AbortController();
    let ran = false;
    const job = queue.post(
      () => {
        ran = true;
      },
      { signal: controller.signal },
    );
    controller.abort();
    await queue.flush();
    await expect(job).rejects.toMatchObject({ name: "AbortError" });
    expect(ran).toBe(false);
  });

  it("awaits promise jobs and reports idle", async () => {
    const queue = new CooperativeTaskQueue({ sliceMs: 1000 });
    const values: number[] = [];
    const job = queue.post(async () => {
      await Promise.resolve();
      values.push(1);
      return 7;
    });
    await expect(job).resolves.toBe(7);
    await queue.idle();
    expect(values).toEqual([1]);
    expect(queue.busy).toBe(false);
  });

  it("exposes a shared queue and a UI yield", async () => {
    let ran = false;
    const result = await postTask(() => {
      ran = true;
      return "ok";
    });
    await taskQueue.idle();
    expect(result).toBe("ok");
    expect(ran).toBe(true);
    await expect(yieldToUI()).resolves.toBeUndefined();
  });
});
