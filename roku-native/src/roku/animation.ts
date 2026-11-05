/**
 * Animation value + controller semantics matching the renderer contract used
 * by Solid's transitions: controllers are explicit, start on demand, retarget
 * while running, and resolve `waitUntilStopped()` exactly once per run.
 */

import { Events } from './events';

export type Easing = (t: number) => number;
export type AnimationControllerState = 'scheduled' | 'running' | 'paused' | 'stopped';

const linear: Easing = (t) => t;
const easings: { [name: string]: Easing } = {
  linear,
  ease: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  'ease-in': (t) => t * t,
  'ease-out': (t) => 1 - (1 - t) * (1 - t),
  'ease-in-out': (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  quadIn: (t) => t * t,
  quadOut: (t) => t * (2 - t),
  quadInOut: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  cubicIn: (t) => t * t * t,
  cubicOut: (t) => 1 - Math.pow(1 - t, 3),
  cubicInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

export function resolveEasing(easing?: string | Easing): Easing {
  if (typeof easing === 'function') return easing;
  if (easing && easings[easing] !== undefined) return easings[easing];
  return linear;
}

const COLOR_KEYS: Record<string, true> = {
  color: true,
  colorTop: true,
  colorBottom: true,
  colorLeft: true,
  colorRight: true,
  colorTopLeft: true,
  colorTopRight: true,
  colorBottomLeft: true,
  colorBottomRight: true,
  colorTl: true,
  colorTr: true,
  colorBl: true,
  colorBr: true,
  textColor: true,
  placeholderColor: true,
  blendColor: true,
};

export function isColorKey(key: string): boolean {
  return COLOR_KEYS[key] === true;
}

/** Per-channel RGBA interpolation (0xRRGGBBAA). */
export function lerpColor(from: number, to: number, t: number): number {
  const a = from >>> 0;
  const b = to >>> 0;
  const r = Math.round(((a >>> 24) & 255) + ((((b >>> 24) & 255) - ((a >>> 24) & 255)) * t));
  const g = Math.round(((a >>> 16) & 255) + ((((b >>> 16) & 255) - ((a >>> 16) & 255)) * t));
  const bl = Math.round(((a >>> 8) & 255) + ((((b >>> 8) & 255) - ((a >>> 8) & 255)) * t));
  const al = Math.round((a & 255) + (((b & 255) - (a & 255)) * t));
  return (((r & 255) << 24) | ((g & 255) << 16) | ((bl & 255) << 8) | (al & 255)) >>> 0;
}

export interface AnimationSettings {
  duration?: number;
  delay?: number;
  easing?: string | Easing;
  loop?: boolean;
  repeat?: number;
  repeatDelay?: number;
  stopMethod?: 'reverse' | false;
  adaptiveDuration?: boolean;
  remove?: boolean;
}

export interface AnimationInit {
  value: number;
  target: number;
  duration?: number;
  delay?: number;
  easing?: string | Easing;
  loop?: boolean;
  repeat?: number;
  repeatDelay?: number;
  onUpdate?: (value: number) => void;
  onWake?: () => void;
  /** Optional eased-progress -> value map (color interpolation). */
  map?: (progress: number) => number;
}

export class Animation extends Events {
  value: number;
  startValue: number;
  initialValue: number;
  target: number;
  duration: number;
  delay: number;
  easing: Easing;
  repeat: number;
  loop: boolean;
  repeatDelay: number;
  private onUpdate: ((value: number) => void) | undefined;
  private onWake: (() => void) | undefined;
  private map: ((progress: number) => number) | undefined;
  private t = 0;
  private started = false;
  private active = false;
  private paused = false;
  private finished = false;
  private removed = false;
  private wait = 0;

  constructor(init: AnimationInit) {
    super();
    this.value = init.value;
    this.startValue = init.value;
    this.initialValue = init.value;
    this.target = init.target;
    this.duration = Math.max(0, init.duration || 0);
    this.delay = Math.max(0, init.delay || 0);
    this.easing = resolveEasing(init.easing);
    this.repeat = Math.max(0, init.repeat || 0);
    this.loop = !!init.loop;
    this.repeatDelay = Math.max(0, init.repeatDelay || 0);
    this.onUpdate = init.onUpdate;
    this.onWake = init.onWake;
    this.map = init.map;
    this.wait = this.delay;
  }

  start(): this {
    if (this.finished) return this;
    this.active = true;
    if (this.onWake) this.onWake();
    return this;
  }
  pause(): this {
    this.paused = true;
    return this;
  }
  resume(): this {
    this.paused = false;
    if (this.onWake) this.onWake();
    return this;
  }
  stop(): this {
    if (this.finished) return this;
    this.finished = true;
    this.active = false;
    this.emit('stop');
    return this;
  }
  /** Reverse toward the run's initial value over the elapsed progress. */
  reverse(): this {
    if (this.finished) return this;
    const elapsed = this.duration * this.t;
    this.startValue = this.value;
    this.target = this.initialValue;
    this.duration = Math.max(0, elapsed);
    this.t = 0;
    this.wait = 0;
    this.finished = false;
    this.active = true;
    if (this.onWake) this.onWake();
    return this;
  }
  /** Return to the initial value immediately. */
  restore(): this {
    this.value = this.initialValue;
    this.startValue = this.initialValue;
    this.target = this.initialValue;
    this.t = 0;
    this.finished = false;
    this.active = true;
    if (this.onUpdate) this.onUpdate(this.value);
    if (this.onWake) this.onWake();
    return this;
  }
  retarget(target: number): this {
    this.startValue = this.value;
    this.target = target;
    this.t = 0;
    this.wait = 0;
    this.finished = false;
    this.active = true;
    if (this.onWake) this.onWake();
    return this;
  }

  tick(delta: number): boolean {
    if (this.removed) return false;
    if (!this.active) return !this.finished;
    if (this.paused) return true;
    if (!this.started) {
      this.started = true;
      this.wait = this.delay;
      this.emit('start');
      if (this.wait > 0) return true;
    }
    if (this.wait > 0) {
      this.wait -= delta;
      if (this.wait > 0) return true;
      delta = -this.wait;
      this.wait = 0;
    }
    if (this.duration <= 0) {
      this.t = 1;
    } else {
      this.t = Math.min(1, this.t + delta / this.duration);
    }
    const p = this.easing(this.t);
    this.value = this.map
      ? this.map(p)
      : this.startValue + (this.target - this.startValue) * p;
    if (this.onUpdate) this.onUpdate(this.value);
    if (this.t >= 1) {
      if (this.loop || this.repeat > 0) {
        if (!this.loop) this.repeat--;
        this.t = 0;
        this.wait = this.repeatDelay;
        // A loop/repeat starts over from the animation's initial value, not
        // from the value it just reached (which would leave it pinned at the
        // target forever). Reset immediately so the repeat delay does not
        // hold the final frame.
        this.startValue = this.initialValue;
        this.value = this.initialValue;
        if (this.onUpdate) this.onUpdate(this.value);
        this.emit('loop');
        return true;
      }
      this.finished = true;
      this.active = false;
      this.emit('finish');
      return false;
    }
    return true;
  }

  remove() {
    this.removed = true;
    this.active = false;
  }
  get running() { return this.active && !this.finished; }
  get done() { return this.finished || this.removed; }
}

export class AnimationController extends Events {
  state: AnimationControllerState = 'scheduled';
  private entries: Animation[];
  private settings: AnimationSettings;
  private stopPromise: Promise<void> | null = null;
  private resolveStop: (() => void) | null = null;

  constructor(entries: Animation[], settings: AnimationSettings = {}) {
    super();
    this.entries = entries;
    this.settings = settings;
    for (let i = 0; i < entries.length; i++) {
      entries[i].on('finish', () => this.maybeDone());
      entries[i].on('stop', () => this.maybeDone());
    }
    if (entries.length === 0) this.finish();
  }

  start(): this {
    if (this.state === 'stopped') return this;
    this.state = 'running';
    for (let i = 0; i < this.entries.length; i++) this.entries[i].start();
    if (this.entries.length === 0 || this.entries.every((entry) => entry.done)) this.finish();
    return this;
  }
  stop(): this {
    if (this.state === 'stopped') return this;
    if (this.settings.stopMethod === 'reverse') {
      for (let i = 0; i < this.entries.length; i++) this.entries[i].reverse();
      this.state = 'running';
      return this;
    }
    for (let i = 0; i < this.entries.length; i++) this.entries[i].stop();
    this.finish();
    return this;
  }
  pause(): this {
    if (this.state === 'stopped') return this;
    this.state = 'paused';
    for (let i = 0; i < this.entries.length; i++) this.entries[i].pause();
    return this;
  }
  restore(): this {
    if (this.state === 'stopped') return this;
    this.state = 'running';
    for (let i = 0; i < this.entries.length; i++) this.entries[i].restore();
    return this;
  }
  retarget(value: number): this {
    for (let i = 0; i < this.entries.length; i++) this.entries[i].retarget(value);
    this.state = 'running';
    return this;
  }
  waitUntilStopped(): Promise<void> {
    if (this.state === 'stopped') return Promise.resolve();
    if (this.stopPromise === null) {
      this.stopPromise = new Promise<void>((resolve) => {
        this.resolveStop = resolve;
      });
    }
    return this.stopPromise;
  }
  get progress(): number {
    return this.entries.length > 0 ? 1 : 0;
  }
  private maybeDone() {
    if (this.entries.every((entry) => entry.done)) this.finish();
  }
  private finish() {
    if (this.state === 'stopped') return;
    this.state = 'stopped';
    const resolve = this.resolveStop;
    this.resolveStop = null;
    this.stopPromise = null;
    if (resolve) resolve();
    this.emit('stopped');
  }
}

interface Track {
  animation: Animation;
  remove: boolean;
}

export class Animator {
  private tracks = new Map<any, Map<string, Track>>();
  paused = false;

  create(node: any, props: any, settings: AnimationSettings, wake: () => void): AnimationController {
    const map = this.tracks.get(node) || new Map<string, Track>();
    this.tracks.set(node, map);
    const entries: Animation[] = [];
    for (const key in props) {
      const target = props[key];
      if (typeof target !== 'number') continue;
      const existing = map.get(key);
      if (existing) existing.animation.stop();
      const current = typeof node[key] === 'number' ? node[key] : 0;
      const isColor = isColorKey(key);
      const animation = new Animation({
        // Colours are interpolated channel-by-channel. Treating a packed
        // 0xRRGGBBAA value as one number produced random low bytes on the Roku
        // JS engine (large-number arithmetic), so the intermediate fills
        // flickered through unrelated colours.
        value: isColor ? 0 : current,
        target: isColor ? 1 : target,
        duration: settings.duration,
        delay: settings.delay,
        easing: settings.easing,
        loop: settings.loop,
        repeat: settings.repeat,
        repeatDelay: settings.repeatDelay,
        onWake: wake,
        map: isColor ? (p: number) => lerpColor(current, target, p) : undefined,
        onUpdate: (value) => {
          node[key] = value;
          node.requestRender();
        },
      });
      map.set(key, { animation, remove: !!settings.remove });
      entries.push(animation);
    }
    if (Object.keys(props).every((key) => typeof props[key] !== 'number')) {
      // Non-numeric props (shaderProps, textureOptions) still need a completion
      // signal; the visual values were already written by the caller.
      const animation = new Animation({
        value: 0,
        target: 0,
        duration: settings.duration,
        delay: settings.delay,
        easing: settings.easing,
        onWake: wake,
      });
      const key = '__wait__' + Math.random();
      map.set(key, { animation, remove: true });
      entries.push(animation);
    }
    return new AnimationController(entries, settings);
  }

  tick(delta: number) {
    if (this.paused) return;
    this.tracks.forEach((map, node) => {
      map.forEach((track, key) => {
        if (track.animation.done) return;
        const alive = track.animation.tick(delta);
        if (!alive) {
          if (track.remove) {
            map.delete(key);
            if (map.size === 0) this.tracks.delete(node);
            if (key === 'alpha' && track.animation.target === 0) node.destroy();
          }
        }
      });
    });
  }

  removeFor(node: any) {
    const map = this.tracks.get(node);
    if (map) {
      map.forEach((track) => track.animation.remove());
      this.tracks.delete(node);
    }
  }

  get running(): boolean {
    for (const map of this.tracks.values()) {
      for (const track of map.values()) {
        if (track.animation.running) return true;
      }
    }
    return false;
  }

  clear() {
    this.tracks.clear();
  }
}
