/**
 * Cooperative background-task queue for the single-threaded Roku JS runtime.
 *
 * Roku has no JavaScript workers. CPU work on the UI thread must be split into
 * short slices so focus, animation and video stay responsive. This queue runs
 * jobs by priority for at most `sliceMs`, yields to the SceneGraph event loop,
 * and resumes. Network/image work remains firmware-async and can be posted as
 * a promise job; true parallel CPU work belongs in a SceneGraph Task node
 * (see ROKU-ARCHITECTURE.md).
 *
 * The clock and scheduler are injectable so the ordering/slicing contract can
 * be unit-tested without real time.
 */

export interface TaskQueueOptions {
  /** Maximum synchronous milliseconds before yielding. Default 8ms. */
  sliceMs?: number;
  /** Clock used for slicing; defaults to Date.now. */
  now?: () => number;
  /** Yield primitive; defaults to setTimeout(fn, 0). */
  schedule?: (fn: () => void, ms: number) => any;
  /** Cancel a scheduled yield. */
  cancel?: (handle: any) => void;
}

export interface TaskOptions {
  /** Higher priority runs first. Default 0. */
  priority?: number;
  signal?: AbortSignal;
}

interface Job<T = unknown> {
  id: number;
  priority: number;
  signal?: AbortSignal;
  run: () => T | Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}

function abortError(): Error {
  const error = new Error("Task aborted");
  error.name = "AbortError";
  return error;
}

const isThenable = (value: any): value is PromiseLike<any> =>
  value !== null && typeof value === "object" && typeof value.then === "function";

export class CooperativeTaskQueue {
  private queue: Job[] = [];
  private timer: any = null;
  private running = false;
  private active = 0;
  private nextId = 1;
  private idleResolvers: Array<() => void> = [];
  private readonly sliceMs: number;
  private readonly now: () => number;
  private readonly schedule: (fn: () => void, ms: number) => any;
  private readonly cancel: (handle: any) => void;

  constructor(options: TaskQueueOptions = {}) {
    this.sliceMs = Math.max(1, options.sliceMs ?? 8);
    this.now = options.now ?? (() => Date.now());
    this.schedule =
      options.schedule ??
      ((fn, ms) => setTimeout(fn, ms));
    this.cancel =
      options.cancel ??
      ((handle) => clearTimeout(handle));
  }

  get pending(): number {
    return this.queue.length;
  }

  get busy(): boolean {
    return this.running || this.queue.length > 0 || this.active > 0;
  }

  /** Queue a job. The returned promise settles with the job's result. */
  post<T>(job: () => T | Promise<T>, options: TaskOptions = {}): Promise<T> {
    const signal = options.signal;
    if (signal?.aborted) return Promise.reject(abortError());
    const entry: Job<T> = {
      id: this.nextId++,
      priority: options.priority ?? 0,
      signal,
      run: job,
      resolve: () => {},
      reject: () => {},
    };
    const promise = new Promise<T>((resolve, reject) => {
      entry.resolve = resolve;
      entry.reject = reject;
    });
    this.queue.push(entry as Job);
    this.queue.sort((a, b) => b.priority - a.priority || a.id - b.id);
    this.scheduleDrain(0);
    return promise;
  }

  /** Resolve once every queued and in-flight job has settled. */
  idle(): Promise<void> {
    if (!this.busy) return Promise.resolve();
    return new Promise<void>((resolve) => this.idleResolvers.push(resolve));
  }

  /** Run the whole queue immediately (tests/diagnostics only). */
  async flush(): Promise<void> {
    this.running = true;
    if (this.timer !== null) {
      this.cancel(this.timer);
      this.timer = null;
    }
    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      await this.runJob(job);
    }
    this.running = false;
    this.resolveIdle();
  }

  private scheduleDrain(ms: number): void {
    if (this.timer !== null || this.running) return;
    this.timer = this.schedule(() => {
      this.timer = null;
      void this.drain();
    }, ms);
  }

  private async runJob(job: Job): Promise<void> {
    if (job.signal?.aborted) {
      job.reject(abortError());
      return;
    }
    this.active++;
    try {
      const value = job.run();
      if (isThenable(value)) {
        const result = await value;
        job.resolve(result);
      } else {
        job.resolve(value);
      }
    } catch (error) {
      job.reject(error);
    } finally {
      this.active--;
    }
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const start = this.now();
    while (this.queue.length > 0 && this.now() - start < this.sliceMs) {
      const job = this.queue.shift()!;
      if (job.signal?.aborted) {
        job.reject(abortError());
        continue;
      }
      // Await only synchronous completion here. A promise job is started and
      // tracked; its CPU portion has already run inside job.run().
      const value = (() => {
        try {
          return job.run();
        } catch (error) {
          job.reject(error);
          return undefined;
        }
      })();
      if (isThenable(value)) {
        this.active++;
        Promise.resolve(value).then(
          (result) => {
            job.resolve(result);
            this.active--;
            this.resolveIdle();
          },
          (error) => {
            job.reject(error);
            this.active--;
            this.resolveIdle();
          },
        );
      } else {
        job.resolve(value as any);
      }
    }
    this.running = false;
    if (this.queue.length > 0) {
      this.scheduleDrain(0);
    } else {
      this.resolveIdle();
    }
  }

  private resolveIdle(): void {
    if (this.busy) return;
    const resolvers = this.idleResolvers;
    this.idleResolvers = [];
    for (const resolve of resolvers) resolve();
  }
}

/** Shared queue for non-critical app work. */
export const taskQueue = new CooperativeTaskQueue();

export function postTask<T>(job: () => T | Promise<T>, options?: TaskOptions): Promise<T> {
  return taskQueue.post(job, options);
}

/** Explicitly yield so SceneGraph can process input/animation. */
export function yieldToUI(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
