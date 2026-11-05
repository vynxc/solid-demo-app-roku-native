/**
 * Minimal synchronous event emitter shared by the SceneGraph renderer
 * adapters. The published @solidtv/renderer uses the same `on`/`once`/`off`/
 * `emit` shape, so framework and app code can subscribe unchanged.
 */
export class Events {
  handlers: Map<string, Set<Function>> | null = null;

  on(name: string, fn: Function): this {
    if (this.handlers === null) this.handlers = new Map();
    let set = this.handlers.get(name);
    if (set === undefined) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(fn);
    return this;
  }

  once(name: string, fn: Function): this {
    const cb = (...args: any[]) => {
      this.off(name, cb);
      fn(...args);
    };
    return this.on(name, cb);
  }

  off(name: string, fn: Function): this {
    if (this.handlers !== null) {
      const set = this.handlers.get(name);
      if (set !== undefined) set.delete(fn);
    }
    return this;
  }

  emit(name: string, ...args: any[]): void {
    if (this.handlers === null) return;
    const set = this.handlers.get(name);
    if (set === undefined || set.size === 0) return;
    // Copy: a listener may unsubscribe itself or add another.
    const list = Array.from(set);
    for (let i = 0; i < list.length; i++) list[i](this, ...args);
  }

  listenerCount(name: string): number {
    if (this.handlers === null) return 0;
    const set = this.handlers.get(name);
    return set === undefined ? 0 : set.size;
  }

  removeAllListeners(): void {
    if (this.handlers !== null) this.handlers.clear();
  }
}
