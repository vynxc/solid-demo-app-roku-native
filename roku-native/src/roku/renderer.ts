/**
 * SolidTV renderer backend for native Roku SceneGraph.
 *
 * The shared framework owns the scene graph, layout, focus and animation
 * requests; this class only turns nodes into RSG Groups and posts one flush per
 * tick. No WebGL, DOM canvas or second UI is involved.
 */

import { createElement, insertNode, setProp } from '@roku-sdk/solid';
import { getAppMemoryMonitor } from '@roku-sdk/rsg-ts/runtime';
import { Animator } from './animation';
import { Events } from './events';
import { fontMetrics, measureText as measureNativeText } from './fonts';
import { RokuNode, RokuTexture, ShaderHandle } from './node';

const APP_W = 1920;
const APP_H = 1080;
const nowMs = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

export class SceneGraphRenderer extends Events {
  settings: any;
  rootId: any;
  root: RokuNode;
  animator = new Animator();
  stage = this;

  private nativeRoot: any;
  private dirty = new Set<RokuNode>();
  private flushTimer: any = null;
  private tickTimer: any = null;
  private lastTick = 0;
  private shaderTypes = new Map<string, any>();
  private destroyed = false;
  private fpsTimer: any = null;
  private frameCount = 0;
  private flushMsSum = 0;
  private flushMsMax = 0;
  private flushSamples = 0;
  private memMonitor: any = null;
  private lastStats = { visuals: 0, textures: 0, visibleTextures: 0 };
  private perfBox: RokuNode | null = null;
  private perfLabel: RokuNode | null = null;
  private routeLabel: RokuNode | null = null;
  private dirtyList: RokuNode[] = [];

  constructor(settings: any = {}, rootId: any = 'app') {
    super();
    this.settings = settings;
    this.rootId = rootId;
    this.nativeRoot = (globalThis as any).__solidtvNativeRoot || null;
    if (!this.nativeRoot) {
      console.error('ROKU_ROOT globalThis.__solidtvNativeRoot is not set; the app will not be visible');
    }
    // The renderer root is the app group. The host already inserted it into the
    // scene (usually inside a Scene with a solid background).
    this.root = new RokuNode(this, { w: APP_W, h: APP_H }, this.nativeRoot || undefined, false);
    this.root.parent = null;
    // Native-only diagnostics under the shared FPS panel. The panel itself
    // reports the actual dirty-update rate; this line reports the frame-time
    // capacity separately so the two cannot be confused.
    this.perfBox = new RokuNode(this, { w: 330, h: 66, x: 1580, y: 266, zIndex: 10001, color: 0x000000ff }, undefined, false);
    this.perfBox.parent = this.root;
    this.perfLabel = new RokuNode(this, {
      w: 320, h: 30, x: 0, y: 3, fontSize: 14, color: 0xffffffff,
      text: 'perf: waiting', contain: 'width',
    }, undefined, true);
    this.perfLabel.parent = this.perfBox;
    const initialRoute = (globalThis as any).location?.hash || '';
    this.routeLabel = new RokuNode(this, {
      w: 320, h: 26, x: 0, y: 35, fontSize: 12, color: 0xffffffff,
      text: 'route ' + (initialRoute || '?'), contain: 'width',
    }, undefined, true);
    this.routeLabel.parent = this.perfBox;
    (globalThis as any).__rokuRenderer = this;
    this.fpsTimer = setInterval(() => {
      const updates = this.frameCount;
      const samples = this.flushSamples;
      const avgMs = samples > 0 ? this.flushMsSum / samples : 0;
      const maxMs = this.flushMsMax;
      const capacityFps = samples > 0 ? Math.max(1, Math.round(1000 / Math.max(0.1, avgMs))) : 0;
      this.frameCount = 0;
      this.flushMsSum = 0;
      this.flushMsMax = 0;
      this.flushSamples = 0;
      if (this.perfLabel) {
        this.perfLabel.text = updates > 0
          ? 'flush ' + avgMs.toFixed(2) + 'ms · head ' + capacityFps + ' · upd ' + updates + '/s'
          : 'idle · upd 0/s';
      }
      if (this.routeLabel) {
        const route = (globalThis as any).location?.hash || '?';
        this.routeLabel.text = 'route ' + route;
      }
      // The panel's FPS is the number of dirty frames actually produced this
      // second (0 is valid); frame-time headroom is carried separately.
      this.emit('fpsUpdate', { fps: updates, updates, avgFlushMs: avgMs, maxFlushMs: maxMs, capacityFps });
      if (updates > 0) {
        const stats = this.collectStats();
        this.lastStats = stats;
        this.emit('renderUpdate', { quads: stats.visuals, renderOps: stats.visuals });
        console.log(
          'ROKU_PERF updates=' + updates +
          ' avgFlushMs=' + avgMs.toFixed(2) +
          ' maxFlushMs=' + maxMs +
          ' capacityFps=' + capacityFps,
        );
      }
    }, 1000);
    getAppMemoryMonitor()
      .then((monitor) => { this.memMonitor = monitor; })
      .catch((err) => { console.warn('ROKU_MEMORY_MONITOR unavailable: ' + err); });
    console.log('ROKU_RENDERER ready ' + APP_W + 'x' + APP_H);
  }

  getFontRoot() {
    return this.nativeRoot || this.root.dom;
  }

  markDirty(node: RokuNode) {
    if (this.destroyed) return;
    this.dirty.add(node);
    this.scheduleFlush();
  }

  requestRender() {
    this.scheduleFlush();
  }

  /**
   * A font face became measurable. Dirty every text node so flush() re-runs
   * its layout with the new metrics (a dirty-driven renderer otherwise never
   * revisits auto-width labels).
   */
  setRoute(route: string) {
    if (this.routeLabel) this.routeLabel.text = 'route ' + String(route || '?');
  }

  onFontVersionChanged() {
    if (this.destroyed) return;
    const walk = (node: RokuNode) => {
      if (node.destroyed) return;
      if ((node as any)._isText) node.markVisual();
      const children = node.children;
      for (let i = 0; i < children.length; i++) walk(children[i]);
    };
    walk(this.root);
    this.scheduleFlush();
  }

  defer(fn: () => void) {
    setTimeout(fn, 0);
  }

  private scheduleFlush() {
    if (this.flushTimer !== null || this.destroyed) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, 0);
  }

  ensureTicker() {
    if (this.tickTimer !== null || this.destroyed) return;
    this.lastTick = Date.now();
    this.tickTimer = setTimeout(() => {
      this.tickTimer = null;
      if (this.destroyed) return;
      const now = Date.now();
      const delta = Math.min(100, now - this.lastTick);
      this.lastTick = now;
      this.animator.tick(delta);
      this.flushDirty();
      if (this.animator.running) this.ensureTicker();
    }, 16);
  }

  private flushDirty() {
    if (this.dirty.size === 0) return;
    // Reuse the array: this runs on every frame, and Array.from allocated a
    // fresh array for each batch.
    const nodes = this.dirtyList;
    nodes.length = 0;
    this.dirty.forEach((node) => nodes.push(node));
    this.dirty.clear();
    const start = nowMs();
    // One frame = one batch of node writes, whether it came from the batched
    // flush() or from an animation tick. Counting only flush() made the FPS
    // panel under-report animations, which update through the ticker.
    this.frameCount++;
    // Large scenes can produce hundreds of dirty nodes in one tick (route
    // swaps, virtualized rows, font reflow). Never hold the UI thread for a
    // whole frame: write for at most flushBudgetMs, then requeue the rest.
    const budget = Math.max(1, Number(this.settings?.flushBudgetMs ?? 8));
    for (let i = 0; i < nodes.length; i++) {
      if (i > 0 && nowMs() - start >= budget) {
        for (let j = i; j < nodes.length; j++) {
          if (!nodes[j].destroyed) this.dirty.add(nodes[j]);
        }
        this.scheduleFlush();
        break;
      }
      const node = nodes[i];
      if (node.destroyed) continue;
      try {
        node.flush();
      } catch (error) {
        console.error('ROKU_FLUSH ' + node.id + ' ' + String((error as any)?.stack || error));
      }
    }
    const elapsed = nowMs() - start;
    this.flushMsSum += elapsed;
    if (elapsed > this.flushMsMax) this.flushMsMax = elapsed;
    this.flushSamples++;
  }

  flush() {
    if (this.destroyed) return;
    this.flushDirty();
    try {
      this.emit('idle');
    } catch (error) {
      console.error('ROKU_IDLE ' + String((error as any)?.stack || error));
    }
    if (this.dirty.size > 0) this.scheduleFlush();
    if (this.animator.running) this.ensureTicker();
  }

  // ---- renderer contract ------------------------------------------------

  createNode(props: any = {}) {
    const node = new RokuNode(this, props, undefined, false);
    return node;
  }

  createTextNode(props: any = {}) {
    const node = new RokuNode(this, props, undefined, true);
    return node;
  }

  createShader(name: any, props: any = {}) {
    const typeName = typeof name === 'string' ? name : String(name?.name || name?.shaderType || 'shader');
    return new ShaderHandle(typeName, props);
  }

  createTexture(type: any, props: any = {}) {
    return new RokuTexture(String(type), props);
  }

  registerShaderType(name: any, shaderType?: any) {
    const key = typeof name === 'string' ? name : String(name?.name || '');
    if (key) this.shaderTypes.set(key, shaderType || name);
  }

  registerShader(name: any, shaderType?: any) {
    this.registerShaderType(name, shaderType);
  }

  measureText(
    text: string,
    fontFamily?: string,
    fontWeight?: any,
    fontSize: number = 32,
    letterSpacing: number = 0,
    maxWidth: number = 0,
  ) {
    const width = measureNativeText(fontFamily, fontWeight, fontSize, String(text || '')) + Math.max(0, String(text || '').length - 1) * letterSpacing;
    const height = fontMetrics(fontFamily, fontWeight, fontSize).lineHeight;
    return { width, height, maxWidth: maxWidth > 0 ? maxWidth : width };
  }

  getCapabilities() {
    return {
      renderMode: 'scenegraph',
      webGlVersion: 0,
      maxTextureSize: 2048,
      shaders: false,
    };
  }

  private collectStats() {
    const stats = { visuals: 0, textures: 0, visibleTextures: 0 };
    const walk = (node: any) => {
      if (!node || (node as any)._destroyed) return;
      const visual = (node as any).visual;
      if (visual) {
        stats.visuals++;
        if ((node as any)._src) {
          stats.textures++;
          if ((node as any)._alpha > 0.001 && (node as any)._w > 0 && (node as any)._h > 0) {
            stats.visibleTextures++;
          }
        }
      }
      const kids = (node as any)._children || [];
      for (let i = 0; i < kids.length; i++) walk(kids[i]);
    };
    walk(this.root);
    return stats;
  }

  memoryInfo() {
    let criticalThreshold = 0;
    let targetThreshold = 0;
    let renderableMemUsed = 0;
    let memUsed = 0;
    if (this.memMonitor) {
      try {
        const limit = this.memMonitor.getChannelMemoryLimit();
        const pct = this.memMonitor.getMemoryLimitPercent();
        let max = Number(limit?.maxForegroundMemory || 0);
        // Roku documents channel memory in KB; some runtimes/tests expose bytes.
        if (max > 0 && max < 10_000_000) max *= 1024;
        if (max > 0) {
          criticalThreshold = max * 0.8;
          targetThreshold = max * 0.64;
          memUsed = max * (Math.max(0, Math.min(100, pct)) / 100);
          renderableMemUsed = memUsed;
        }
      } catch (err) {
        // Leave the panel at zero rather than inventing a number.
      }
    }
    const stats = this.lastStats;
    return {
      renderBufferSize: 0,
      textureMemory: 0,
      usedTextureMemory: 0,
      totalTextureMemory: 0,
      jsHeapSizeLimit: 0,
      totalJSHeapSize: 0,
      usedJSHeapSize: 0,
      criticalThreshold,
      targetThreshold,
      renderableMemUsed,
      memUsed,
      renderableTexturesLoaded: stats.visibleTextures,
      loadedTextures: stats.textures,
    };
  }

  loadFont(_font: any, _options?: any) {
    return Promise.resolve(_font);
  }

  loadFonts(fonts: any[] = []) {
    return Promise.resolve(fonts);
  }

  pause() {
    this.animator.paused = true;
  }

  resume() {
    this.animator.paused = false;
    this.requestRender();
  }

  reprocessUpdates(callback: () => void) {
    setTimeout(callback, 0);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.fpsTimer !== null) clearInterval(this.fpsTimer);
    this.fpsTimer = null;
    if (this.flushTimer !== null) clearTimeout(this.flushTimer);
    if (this.tickTimer !== null) clearTimeout(this.tickTimer);
    this.flushTimer = null;
    this.tickTimer = null;
    this.animator.clear();
    try {
      this.root.destroy();
    } catch (error) {
      console.error('ROKU_DESTROY ' + String((error as any)?.message || error));
    }
    this.dirty.clear();
    this.removeAllListeners();
    if ((globalThis as any).__rokuRenderer === this) (globalThis as any).__rokuRenderer = undefined;
  }
}

export { RokuNode } from './node';
export { RokuTexture, ShaderHandle } from './node';
