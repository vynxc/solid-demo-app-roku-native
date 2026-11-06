/**
 * Browser-shaped services for the shared SolidTV demo on Roku.
 *
 * The demo was written for a browser: it reads window sizes and URL params,
 * navigates with the History API, listens for DOM keyboard events and touches
 * a few DOM APIs. Rendering itself never uses the DOM — that stays native
 * SceneGraph. This module only provides the compatibility surface those pages
 * expect, plus the bridge that turns Roku KeyHandler events into the DOM-like
 * key events SolidTV's focus manager already understands.
 *
 * Install once, before the shared app is imported.
 */

type Listener = (event: any) => void;

class SimpleTarget {
  private listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, fn: Listener) {
    let set = this.listeners.get(type);
    if (set === undefined) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn);
  }

  removeEventListener(type: string, fn: Listener) {
    const set = this.listeners.get(type);
    if (set !== undefined) set.delete(fn);
  }

  dispatchEvent(event: any): boolean {
    event.target = event.target || this;
    const set = this.listeners.get(event.type);
    if (set !== undefined) {
      for (const fn of Array.from(set)) {
        try {
          fn(event);
        } catch (error) {
          console.error('ROKU_EVENT listener failed: ' + String((error as any)?.stack || error));
        }
      }
    }
    return !event.defaultPrevented;
  }
}

// Roku OS 16's JS engine does not provide Array.prototype.flat/flatMap.
// Two shared demo pages (Infinite and TMDBGrid) build their rows with
// `.flat()`, so without this compatibility shim their content is silently
// missing. Implement with plain loops: the same engine also has the
// per-iteration-binding issue that requires forEach in the framework.
function installArrayFlat(): void {
  const proto = Array.prototype as any;
  if (typeof proto.flat !== 'function') {
    Object.defineProperty(proto, 'flat', {
      configurable: true,
      writable: true,
      value: function flat(depth: number = 1) {
        const level = Math.floor(depth);
        if (!(level > 0)) return Array.prototype.slice.call(this);
        const out: any[] = [];
        const walk = (source: any, remaining: number) => {
          for (let i = 0; i < source.length; i++) {
            const value = source[i];
            if (remaining > 0 && Array.isArray(value)) walk(value, remaining - 1);
            else out.push(value);
          }
        };
        walk(this, level);
        return out;
      },
    });
  }
  if (typeof proto.flatMap !== 'function') {
    Object.defineProperty(proto, 'flatMap', {
      configurable: true,
      writable: true,
      value: function flatMap(fn: (value: any, index: number, array: any[]) => any, thisArg?: any) {
        const mapped: any[] = [];
        for (let i = 0; i < this.length; i++) {
          const value = fn.call(thisArg, this[i], i, this);
          if (Array.isArray(value)) {
            for (let j = 0; j < value.length; j++) mapped.push(value[j]);
          } else {
            mapped.push(value);
          }
        }
        return mapped;
      },
    });
  }
}
installArrayFlat();

export class RokEvent {
  type: string;
  bubbles = false;
  cancelable = true;
  defaultPrevented = false;
  target: any = null;
  currentTarget: any = null;
  constructor(type: string, init?: any) {
    this.type = type;
    if (init) Object.assign(this, init);
  }
  preventDefault() {
    this.defaultPrevented = true;
  }
  stopPropagation() {}
  stopImmediatePropagation() {}
}

class RokKeyboardEvent extends RokEvent {
  key: string;
  code: string;
  keyCode: number;
  which: number;
  repeat = false;
  constructor(type: string, init: any) {
    super(type, init);
    this.key = init && init.key !== undefined ? init.key : '';
    this.code = init && init.code !== undefined ? init.code : this.key;
    this.keyCode = init && init.keyCode !== undefined ? init.keyCode : 0;
    this.which = this.keyCode;
    // `repeat` is an own, writable data property: the focus manager shadows it
    // when it infers repeats for a platform that never sets it.
    Object.defineProperty(this, 'repeat', {
      value: !!(init && init.repeat),
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
}

export class RokSearchParams {
  private pairs: Array<[string, string]> = [];
  constructor(init: any = '') {
    if (typeof init === 'string') {
      const source = init.replace(/^\?/, '');
      if (source.length > 0) {
        const parts = source.split('&');
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          if (part.length === 0) continue;
          const eq = part.indexOf('=');
          const key = eq < 0 ? part : part.slice(0, eq);
          const value = eq < 0 ? '' : part.slice(eq + 1);
          this.pairs.push([decode(key), decode(value)]);
        }
      }
    } else if (init && typeof init[Symbol.iterator] === 'function') {
      for (const entry of init as Iterable<[string, string]>) this.pairs.push([String(entry[0]), String(entry[1])]);
    } else if (init) {
      for (const key of Object.keys(init)) this.append(key, init[key]);
    }
  }
  get(key: string): string | null {
    for (let i = 0; i < this.pairs.length; i++) if (this.pairs[i][0] === key) return this.pairs[i][1];
    return null;
  }
  getAll(key: string): string[] {
    return this.pairs.filter((p) => p[0] === key).map((p) => p[1]);
  }
  has(key: string) {
    return this.pairs.some((p) => p[0] === key);
  }
  append(key: string, value: any) {
    this.pairs.push([String(key), String(value)]);
  }
  set(key: string, value: any) {
    this.delete(key);
    this.append(key, value);
  }
  delete(key: string) {
    this.pairs = this.pairs.filter((p) => p[0] !== key);
  }
  toString() {
    return this.pairs.map((p) => encode(p[0]) + '=' + encode(p[1])).join('&');
  }
  entries(): IterableIterator<[string, string]> {
    return this.pairs[Symbol.iterator]() as IterableIterator<[string, string]>;
  }
  keys(): IterableIterator<string> {
    return this.pairs.map((p) => p[0])[Symbol.iterator]();
  }
  values(): IterableIterator<string> {
    return this.pairs.map((p) => p[1])[Symbol.iterator]();
  }
  forEach(fn: (value: string, key: string, params: RokSearchParams) => void) {
    for (let i = 0; i < this.pairs.length; i++) fn(this.pairs[i][1], this.pairs[i][0], this);
  }
  [Symbol.iterator](): IterableIterator<[string, string]> {
    return this.entries();
  }
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch (e) {
    return value;
  }
}
function encode(value: string): string {
  return encodeURIComponent(value);
}

export class RokURL {
  href = '';
  origin = 'https://roku.local';
  protocol = 'https:';
  host = 'roku.local';
  hostname = 'roku.local';
  port = '';
  pathname = '/';
  search = '';
  hash = '';
  searchParams: RokSearchParams = new RokSearchParams('');
  constructor(input: any, base: string = 'https://roku.local/') {
    let raw = String(input);
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw)) {
      const baseMatch = String(base).match(/^(https?:)\/\/([^/?#]+)/);
      const scheme = baseMatch ? baseMatch[1] : this.protocol;
      const host = baseMatch ? baseMatch[2] : this.host;
      raw = scheme + '//' + host + (raw.charAt(0) === '/' ? '' : '/') + raw;
    }
    const match = raw.match(/^([a-zA-Z][a-zA-Z0-9+.-]*:)\/\/([^/?#]+)([^?#]*)(\?[^#]*)?(#.*)?$/);
    if (!match) throw new Error('Unsupported URL ' + raw);
    this.protocol = match[1];
    this.host = this.hostname = match[2];
    this.origin = this.protocol + '//' + this.host;
    this.pathname = match[3] || '/';
    this.search = match[4] || '';
    this.hash = match[5] || '';
    this.href = raw;
    this.searchParams = new RokSearchParams(this.search);
  }
  toString() {
    return this.href;
  }
}

interface RokuKeySpec {
  key: string;
  keyCode: number;
}

// Roku remote key names -> the DOM names and keyCodes the demo's App key map
// already lists. Both names and codes are mapped in focusManager.
const KEY_TABLE: { [name: string]: RokuKeySpec } = {
  left: { key: 'ArrowLeft', keyCode: 37 },
  right: { key: 'ArrowRight', keyCode: 39 },
  up: { key: 'ArrowUp', keyCode: 38 },
  down: { key: 'ArrowDown', keyCode: 40 },
  ok: { key: 'Enter', keyCode: 13 },
  select: { key: 'Enter', keyCode: 13 },
  enter: { key: 'Enter', keyCode: 13 },
  back: { key: 'Back', keyCode: 8 },
  backspace: { key: 'Backspace', keyCode: 8 },
  play: { key: 'PlayPause', keyCode: 10252 },
  playpause: { key: 'PlayPause', keyCode: 10252 },
  pause: { key: 'Pause', keyCode: 19 },
  rev: { key: 'Rewind', keyCode: 412 },
  rewind: { key: 'Rewind', keyCode: 412 },
  fwd: { key: 'FastForward', keyCode: 417 },
  fastforward: { key: 'FastForward', keyCode: 417 },
  instantreplay: { key: 'InstantReplay', keyCode: 10232 },
  info: { key: 'm', keyCode: 77 },
  options: { key: 'm', keyCode: 77 },
  home: { key: 'Home', keyCode: 36 },
  stop: { key: 'Stop', keyCode: 413 },
};

const heldKeys = new Set<string>();
let installed = false;
let doc: any = null;
let lastHandled = false;
const keyTarget = new SimpleTarget();

function specFor(key: string): RokuKeySpec {
  const raw = String(key || '');
  const lower = raw.toLowerCase();
  if (KEY_TABLE[lower] !== undefined) return KEY_TABLE[lower];
  // Already a DOM name (ArrowLeft, Enter, ...). Keep its conventional code.
  const domCodes: { [name: string]: number } = {
    ArrowLeft: 37,
    ArrowRight: 39,
    ArrowUp: 38,
    ArrowDown: 40,
    Enter: 13,
    Back: 8,
    Backspace: 8,
    Escape: 27,
    PlayPause: 10252,
    Play: 415,
    Pause: 19,
    Rewind: 412,
    FastForward: 417,
    Stop: 413,
  };
  return { key: raw, keyCode: domCodes[raw] || 0 };
}

function makeKeyEvent(type: string, spec: RokuKeySpec, repeat: boolean): RokKeyboardEvent {
  return new RokKeyboardEvent(type, {
    key: spec.key,
    code: spec.key,
    keyCode: spec.keyCode,
    which: spec.keyCode,
    repeat,
  });
}

/**
 * Deliver one Roku key press/release to the app. Returns whether the focus
 * manager (or an app handler) consumed it; the Roku KeyHandler returns this
 * so an unhandled Back press at the root can exit the channel.
 *
 * Auto-repeat: Roku sends a stream of press=true events with no release until
 * the key is let go. The second and later presses are marked `repeat`.
 */
export function dispatchNativeKey(key: string, press: boolean): boolean {
  if (!installed) installBrowserServices();
  const spec = specFor(key);
  const id = spec.key || String(key);
  const repeat = press && heldKeys.has(id);
  if (press) heldKeys.add(id);
  else heldKeys.delete(id);
  const event = makeKeyEvent(press ? 'keydown' : 'keyup', spec, repeat);
  // The focus manager, the demo's debug label and useMouse all listen on
  // document. Dispatching once avoids double-handling.
  const doc = (globalThis as any).document;
  doc.dispatchEvent(event);
  // The focus manager calls preventDefault() for keys it handled; an
  // unhandled Back therefore returns false and reaches the Scene exit path.
  lastHandled = event.defaultPrevented === true;
  // An unhandled Back should reach the Scene, which is configured to exit.
  return lastHandled;
}

export function isKeyHandled(): boolean {
  return lastHandled;
}

function makeElement(tag: string): any {
  const el: any = {
    tagName: String(tag).toUpperCase(),
    style: {},
    dataset: {},
    children: [] as any[],
    textContent: '',
    innerHTML: '',
    parentNode: null,
    appendChild(child: any) {
      el.children.push(child);
      child.parentNode = el;
      return child;
    },
    removeChild(child: any) {
      const i = el.children.indexOf(child);
      if (i >= 0) el.children.splice(i, 1);
      child.parentNode = null;
      return child;
    },
    remove() {
      if (el.parentNode) el.parentNode.removeChild(el);
    },
    setAttribute() {},
    getAttribute() {
      return null;
    },
    addEventListener() {},
    removeEventListener() {},
    focus() {},
    blur() {},
    play() {
      return Promise.resolve();
    },
    pause() {},
  };
  return el;
}

/**
 * Install the browser-compatible globals. Idempotent.
 */
export function installBrowserServices(): void {
  if (installed) return;
  installed = true;
  const g = globalThis as any;

  g.performance = g.performance || { now: () => Date.now() };
  if (!g.performance.now) g.performance.now = () => Date.now();
  if (!g.performance.mark) g.performance.mark = () => {};
  if (!g.performance.measure) g.performance.measure = () => {};

  g.window = g;
  g.self = g;
  g.innerWidth = 1920;
  g.innerHeight = 1080;
  g.devicePixelRatio = 1;

  if (!g.requestAnimationFrame) {
    g.requestAnimationFrame = (fn: any) => setTimeout(() => fn(g.performance.now()), 16);
    g.cancelAnimationFrame = (id: any) => clearTimeout(id);
  }
  if (!g.queueMicrotask) {
    g.queueMicrotask = (fn: any) => Promise.resolve().then(fn);
  }
  g.scrollTo = () => {};

  g.URLSearchParams = RokSearchParams;
  g.URL = RokURL;
  g.Event = RokEvent;
  g.CustomEvent = RokEvent;
  g.KeyboardEvent = RokKeyboardEvent;

  // Hash router state. The demo always runs from the app package root, so
  // pathname stays "/" and every route lives in the hash.
  // Test/deep-link route hook: a launch/input parameter such as
  // {"contentId":"/examples"} navigates the shared hash router. The matrix
  // runner uses this to reach every page without a D-pad sequence.
  let hash = (g.__solidtvInitialRoute as string) || '#/browse/all';
  const location: any = {
    protocol: 'https:',
    origin: 'https://roku.local',
    pathname: '/',
    search: '?animations=false&numImageWorkers=0',
    get hash() {
      return hash;
    },
    set hash(value: string) {
      const next = String(value).charAt(0) === '#' ? String(value) : '#' + String(value);
      if (next === hash) return;
      hash = next;
      try { (globalThis as any).__rokuRenderer?.setRoute?.(next); } catch (e) { /* renderer not ready */ }
      doc.dispatchEvent(new RokEvent('hashchange'));
    },
    get href() {
      return this.origin + '/' + this.search + hash;
    },
    assign(url: string) {
      const i = String(url).indexOf('#');
      if (i >= 0) this.hash = String(url).slice(i);
    },
    replace(url: string) {
      this.assign(url);
    },
    reload() {},
  };
  g.location = location;
  g.__solidtvSetRoute = (route: string) => {
    location.hash = String(route);
  };

  const stack: string[] = [hash];
  let position = 0;
  // pushState/replaceState update the URL silently, like a browser. Only
  // location.hash and history.back/forward emit hashchange.
  const setHashSilently = (url: string) => {
    const i = String(url).indexOf('#');
    if (i >= 0) hash = String(url).slice(i);
  };
  g.history = {
    state: null,
    pushState(state: any, _title: string, url: string) {
      this.state = state;
      setHashSilently(url);
      stack.splice(position + 1);
      stack.push(hash);
      position = stack.length - 1;
    },
    replaceState(state: any, _title: string, url: string) {
      this.state = state;
      setHashSilently(url);
      stack[position] = hash;
    },
    back() {
      if (position > 0) {
        position--;
        hash = stack[position];
        doc.dispatchEvent(new RokEvent('popstate'));
        doc.dispatchEvent(new RokEvent('hashchange'));
      }
    },
    forward() {
      if (position < stack.length - 1) {
        position++;
        hash = stack[position];
        doc.dispatchEvent(new RokEvent('popstate'));
        doc.dispatchEvent(new RokEvent('hashchange'));
      }
    },
    go(delta: number) {
      if (delta < 0) {
        for (let i = 0; i < -delta; i++) this.back();
      } else {
        for (let i = 0; i < delta; i++) this.forward();
      }
    },
  };

  doc = new SimpleTarget();
  const document: any = doc;
  document.location = location;
  document.defaultView = g;
  document.documentElement = { clientWidth: 1920, clientHeight: 1080 };
  document.body = document;
  document.head = document;
  document.activeElement = null;
  document.getElementById = () => null;
  document.querySelector = (selector: string) => {
    if (String(selector).indexOf('player') !== -1) return makeElement('view');
    return null;
  };
  document.querySelectorAll = () => [];
  document.getElementsByTagName = (tag: string) => {
    if (String(tag).toLowerCase() === 'canvas') return [makeElement('canvas')];
    return [];
  };
  document.createElement = (tag: string) => makeElement(tag);
  document.createEvent = () => new RokEvent('');
  document.createTextNode = (text: string) => ({ textContent: String(text), nodeType: 3 });
  // The splash element is only used by the web entry point; there is none on
  // Roku, but the lookup must not throw.
  g.document = document;

  // Forward key events dispatched on `window` to the document target too:
  // the focus manager listens on document, but some host code dispatches on
  // window. No listener is installed on this target by the demo itself.
  g.addEventListener = (type: string, fn: Listener) => document.addEventListener(type, fn);
  g.removeEventListener = (type: string, fn: Listener) => document.removeEventListener(type, fn);
  g.dispatchEvent = (event: any) => document.dispatchEvent(event);

  const storage = new Map<string, string>();
  const makeStorage = () => ({
    getItem: (key: string) => (storage.has(String(key)) ? storage.get(String(key))! : null),
    setItem: (key: string, value: any) => {
      storage.set(String(key), String(value));
    },
    removeItem: (key: string) => {
      storage.delete(String(key));
    },
    clear: () => storage.clear(),
    key: (index: number) => Array.from(storage.keys())[index] ?? null,
    get length() {
      return storage.size;
    },
  });
  g.localStorage = makeStorage();
  g.sessionStorage = makeStorage();

  g.navigator = {
    userAgent: 'Roku OS 16 / SolidTV SceneGraph',
    platform: 'Roku',
    language: 'en-US',
  };

  // Roku's firmware fetch takes a single argument (URL or Request). The shared
  // web API calls fetch(url, { headers }) to send the TMDB Bearer token; the
  // second argument is ignored by the firmware, so translate it into a Request.
  const firmwareFetch = g.fetch;
  if (typeof firmwareFetch === 'function' && !g.__solidtvFetchWrapped) {
    g.__solidtvFetchWrapped = true;
    g.fetch = (input: any, init?: any) => {
      try {
        if (init && typeof init === 'object' && (init.headers || init.method || init.body)) {
          const Req = g.Request;
          if (typeof Req === 'function') {
            return firmwareFetch.call(g, new Req(input, init));
          }
          console.error('ROKU_FETCH Request is unavailable; request headers would be dropped');
        }
      } catch (error) {
        console.error('ROKU_FETCH request init failed: ' + String((error as any)?.stack || error));
      }
      return firmwareFetch.call(g, input);
    };
  }

  // Expose the key target for hosts that want to install their own listener
  // instead of relying on document.dispatchEvent.
  g.__solidtvKeyTarget = keyTarget;
  g.__solidtvDispatchKey = dispatchNativeKey;
}
