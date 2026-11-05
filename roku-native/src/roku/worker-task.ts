/**
 * Typed bridge to the SceneGraph `WorkerTask` component.
 *
 * The Task node runs BrightScript on a separate thread. TypeScript cannot
 * execute in that thread, so this API posts a command and observes the
 * response. Add commands in `src/compiled-components/WorkerTask.brs` when an
 * app needs parallel work; use `tasks.ts` for time-sliced TypeScript work.
 */
import { createElement, insertNode, setProp, tmTransaction } from "@roku-sdk/solid";

export type WorkerRequest =
  | { op: "echo"; value: any }
  | { op: "sleep"; ms: number }
  | { op: "json"; text: string }
  | { op: "fetch"; url: string; headers?: Record<string, string> };

interface WorkerResponse<T = any> {
  ok: boolean;
  result?: T;
  error?: string;
}

export interface RokuTaskOptions {
  timeoutMs?: number;
  parent?: any;
}

export interface RokuTaskHandle<T> {
  cancel(): void;
  result: Promise<T>;
}

export function postRokuTask<T = any>(
  request: WorkerRequest,
  options: RokuTaskOptions = {},
): RokuTaskHandle<T> {
  const parent = options.parent || (globalThis as any).__solidtvNativeRoot || null;
  let settled = false;
  let task: any = null;
  let timer: any = null;

  let resolveResult!: (value: T) => void;
  let rejectResult!: (reason?: any) => void;
  const result = new Promise<T>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const cleanup = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (task && parent) {
      try {
        setProp(task, "control", "STOP");
        tmTransaction.removeNode(parent, task);
      } catch (error) {
        // The task may already have been removed by a route teardown.
      }
    }
    task = null;
  };

  const finish = (fn: () => void) => {
    if (settled) return;
    settled = true;
    cleanup();
    fn();
  };

  if (!parent) {
    finish(() => rejectResult(new Error("WorkerTask: no SceneGraph root")));
    return { cancel: () => {}, result };
  }

  try {
    task = createElement("WorkerTask");
    setProp(task, "request", request);
    setProp(task, "onResponse", (response: WorkerResponse<T>) => {
      if (!response || response.ok !== true) {
        finish(() => rejectResult(new Error(response?.error || "WorkerTask failed")));
        return;
      }
      finish(() => resolveResult(response.result as T));
    });
    insertNode(parent, task);
    setProp(task, "control", "RUN");
  } catch (error) {
    finish(() => rejectResult(error));
    return { cancel: () => {}, result };
  }

  const timeoutMs = Math.max(1, options.timeoutMs ?? 10000);
  timer = setTimeout(() => {
    finish(() => rejectResult(new Error(`WorkerTask timed out after ${timeoutMs}ms`)));
  }, timeoutMs);

  return {
    result,
    cancel: () => finish(() => rejectResult(new Error("WorkerTask cancelled"))),
  };
}
