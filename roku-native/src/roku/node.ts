/**
 * SceneGraph node adapter. One instance per SolidTV renderer node.
 *
 * Each node is a Group. Its own visual (Poster/Rectangle/Label) is the first
 * child of that Group, so app children always paint above it. Transform,
 * opacity, clipping and z-order follow the shared renderer's semantics; text
 * is laid out with native font metrics before it is written to a Label.
 */

import { createElement, insertNode, setProp, tmTransaction } from '@roku-sdk/solid';
import { Events } from './events';
import { isColorKey, lerpColor } from './animation';
import { RokuEffect, toRokuColor } from './effects';
import { fontMetrics, getFontVersion, loadFace, measureText, resolveFontUri } from './fonts';
import { layoutText, TextAlign, TextContain, TextLayoutResult, VerticalAlign, WordBreak } from './text-layout';

const APP_W = 1920;
const APP_H = 1080;
let nextUid = 1;

function num(value: any, fallback: number): number {
  return typeof value === 'number' && isFinite(value) ? value : fallback;
}
function same(a: any, b: any): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  return false;
}
const SHEET_SIZES: Record<string, [number, number]> = {
  'pkg:/assets/icons_white.png': [375, 100],
  'pkg:/assets/icons.png': [375, 100],
};
function sheetSize(src: string): [number, number] | null {
  return SHEET_SIZES[normalizeUri(src)] || null;
}
function normalizeUri(src: string): string {
  if (!src) return '';
  if (src.indexOf('file:///app/') === 0) return 'pkg:/' + src.slice(13);
  if (src.indexOf('pkg:/') === 0) return src;
  if (src.charAt(0) === '/') return 'pkg:' + src;
  if (src.indexOf('./') === 0) return 'pkg:/' + src.slice(2);
  if (/^https?:\/\//.test(src)) return src;
  return 'pkg:/' + src;
}
function weightOf(family: string, weight: any): { family: string; weight: number } {
  let fam = String(family || 'Roboto');
  let w = weight;
  const match = /^(.*?)(\d{3})$/.exec(fam);
  if (match) {
    fam = match[1];
    w = Number(match[2]);
  }
  if (typeof w === 'string') {
    w = /bold|black|heavy|semibold|demibold/i.test(w) ? 700 : 400;
  }
  return { family: fam, weight: typeof w === 'number' ? w : 400 };
}

export class RokuTexture extends Events {
  textureType: string;
  props: any;
  src: string;
  state: string = 'loaded';
  destroyed = false;
  constructor(type: string, props: any) {
    super();
    this.textureType = type;
    this.props = props || {};
    if (type === 'SubTexture' && this.props.texture) this.src = this.props.texture.src;
    else this.src = normalizeUri(this.props.src || '');
  }
  get w() {
    return num(this.props.w, 0);
  }
  get h() {
    return num(this.props.h, 0);
  }
  destroy() {
    this.destroyed = true;
    this.removeAllListeners();
  }
}

/** Renderer shader handle. Mutable props are proxied so Effects re-apply. */
export class ShaderHandle {
  shaderType: string;
  name: string;
  props: any;
  nodes = new Set<RokuNode>();
  destroyed = false;
  constructor(name: string, props: any) {
    this.name = name;
    this.shaderType = name;
    const raw = props || {};
    this.props = new Proxy(raw, {
      set: (target: any, key: string, value: any) => {
        target[key] = value;
        this.nodes.forEach((node) => node.effectDirty());
        return true;
      },
      deleteProperty: (target: any, key: string) => {
        delete target[key];
        this.nodes.forEach((node) => node.effectDirty());
        return true;
      },
    });
  }
  destroy() {
    this.destroyed = true;
    this.nodes.clear();
  }
}

export class RokuNode extends Events {
  uid = nextUid++;
  private _isText: boolean;
  readonly stage: any;
  readonly renderer: any;
  dom: any;
  visual: any = null;

  private _parent: RokuNode | null = null;
  private _children: RokuNode[] = [];
  private _x = 0;
  private _y = 0;
  private _w = 0;
  private _h = 0;
  private _ownW = 0;
  private _ownH = 0;
  private _alpha = 1;
  private _color = 0xffffffff;
  private _hasColor = false;
  private _cornerColors = false;
  private _colorTL = 0xffffffff;
  private _colorTR = 0xffffffff;
  private _colorBL = 0xffffffff;
  private _colorBR = 0xffffffff;
  private _colorGap = false;

  private _scaleX = 1;
  private _scaleY = 1;
  private _mountX = 0;
  private _mountY = 0;
  private _pivotX = 0.5;
  private _pivotY = 0.5;
  private _rotation = 0;
  private _zIndex = 0;
  private _rtl: boolean | null = null;
  private _clipping: boolean | number[] = false;
  private _margins: number[] = [0, 0, 0, 0];
  private _layout: TextLayoutResult | null = null;
  private _destroyed = false;

  private _fontFamily = 'Roboto';
  private _fontWeight: any = 400;
  private _fontSize = 32;
  private _lineHeight = 1.2;
  private _maxWidth = 0;
  private _maxHeight = 0;
  private _maxLines = 0;
  private _contain: TextContain = 'none';
  private _textAlign: TextAlign = 'left';
  private _verticalAlign: VerticalAlign = 'top';
  private _wordBreak: WordBreak = 'break-word';
  private _overflowSuffix = '...';
  private _letterSpacing = 0;
  private _offsetY = 0;
  private _textValue = '';
  private _lastLayoutKey = '';
  private _lastFontVersion = -1;
  private _loadedQueued = false;
  private _imageLoadedEmitted = false;
  private _imageLoadedTimer: any = null;

  private _src = '';
  private _texture: RokuTexture | null = null;
  private _sub: number[] | null = null;
  private _subHooked = false;
  private _forceClip = false;
  private _shader: ShaderHandle | null = null;
  private _effect: RokuEffect | null = null;
  private _bands: { node: any; color: number }[] = [];
  private _bandKey = '';
  private _gradientOverlay: any = null;
  private _gradientOverlayKey = '';
  private _data: any = null;
  private _textureOptions: any = { resizeMode: { x: 'fill', y: 'fill' } };
  private _placeholderColor = 0;
  private _placeholder = '';
  private _fallback = '';
  private _initializing = true;

  private _transformDirty = true;
  private _visualDirty = true;
  private _clipDirty = true;
  private _effectDirty = false;
  private _orderDirty = false;
  private _queued = false;
  private _written: { [name: string]: any } = {};
  private _writtenGroup: { [name: string]: any } = {};

  constructor(renderer: any, props: any = {}, existingRoot?: any, text = false) {
    super();
    this.renderer = renderer;
    this.stage = renderer;
    this._isText = text;
    this.dom = existingRoot || createElement('group');
    const p = props || {};
    this._color = p.color !== undefined ? p.color : 0xffffffff;
    this._hasColor =
      p.color !== undefined ||
      p.colorTop !== undefined ||
      p.colorBottom !== undefined ||
      p.colorLeft !== undefined ||
      p.colorRight !== undefined ||
      p.colorTopLeft !== undefined ||
      p.colorTopRight !== undefined ||
      p.colorBottomLeft !== undefined ||
      p.colorBottomRight !== undefined ||
      p.shader !== undefined;
    this._colorTL = p.colorTopLeft !== undefined ? p.colorTopLeft : p.colorTop !== undefined ? p.colorTop : this._color;
    this._colorTR = p.colorTopRight !== undefined ? p.colorTopRight : p.colorTop !== undefined ? p.colorTop : this._color;
    this._colorBL = p.colorBottomLeft !== undefined ? p.colorBottomLeft : p.colorBottom !== undefined ? p.colorBottom : this._color;
    this._colorBR = p.colorBottomRight !== undefined ? p.colorBottomRight : p.colorBottom !== undefined ? p.colorBottom : this._color;
    this.applyProps(p);
    if (p.parent) this.parent = p.parent;
    this._initializing = false;
    if (text) this.reflow();
    this.renderer.markDirty(this);
  }

  private applyProps(props: any) {
    for (const key in props) {
      const value = props[key];
      if (value === undefined) continue;
      switch (key) {
        case 'parent':
          // The parent link itself is applied after the prop loop. Do not let
          // it fall through into the colour case: a RokuNode is not a colour.
          break;
        case 'color': this._color = value; this._hasColor = true; break;
        case 'colorTop': this._effectDirty = true; this._colorTL = this._colorTR = value; this._hasColor = true; break;
        case 'colorBottom': this._effectDirty = true; this._colorBL = this._colorBR = value; this._hasColor = true; break;
        case 'colorLeft': this._effectDirty = true; this._colorTL = this._colorBL = value; this._hasColor = true; break;
        case 'colorRight': this._effectDirty = true; this._colorTR = this._colorBR = value; this._hasColor = true; break;
        case 'colorTopLeft': this._effectDirty = true; this._colorTL = value; this._cornerColors = true; this._hasColor = true; break;
        case 'colorTopRight': this._effectDirty = true; this._colorTR = value; this._cornerColors = true; this._hasColor = true; break;
        case 'colorBottomLeft': this._effectDirty = true; this._colorBL = value; this._cornerColors = true; this._hasColor = true; break;
        case 'colorBottomRight': this._effectDirty = true; this._colorBR = value; this._cornerColors = true; this._hasColor = true; break;
        case 'w':
          if (this._isText) this._ownW = num(value, 0);
          else this._w = num(value, 0);
          break;
        case 'h':
          if (this._isText) this._ownH = num(value, 0);
          else this._h = num(value, 0);
          break;
        case 'x': this._x = num(value, 0); break;
        case 'y': this._y = num(value, 0); break;
        case 'alpha': this._alpha = num(value, 1); break;
        case 'scale': {
          const s = num(value, 1);
          this._scaleX = s;
          this._scaleY = s;
          break;
        }
        case 'scaleX': this._scaleX = num(value, 1); break;
        case 'scaleY': this._scaleY = num(value, 1); break;
        case 'mountX': this._mountX = num(value, 0); break;
        case 'mountY': this._mountY = num(value, 0); break;
        case 'pivotX': this._pivotX = num(value, 0.5); break;
        case 'pivotY': this._pivotY = num(value, 0.5); break;
        case 'rotation': this._rotation = num(value, 0); break;
        case 'zIndex': this._zIndex = num(value, 0); this.markOrder(); break;
        case 'rtl': this._rtl = value === undefined ? null : !!value; break;
        case 'clipping':
          this._clipping = value === true || Array.isArray(value) ? value : false;
          break;
        case 'marginLeft': this._margins[0] = num(value, 0); break;
        case 'marginTop': this._margins[1] = num(value, 0); break;
        case 'marginRight': this._margins[2] = num(value, 0); break;
        case 'marginBottom': this._margins[3] = num(value, 0); break;
        case 'src': this.src = String(value); break;
        case 'texture': this.setTexture(value); break;
        case 'shader': this.setShader(value); break;
        case 'data': this._data = value; break;
        case 'textureOptions': this._textureOptions = value || this._textureOptions; break;
        case 'placeholderColor': this._placeholderColor = value; break;
        case 'placeholder': this._placeholder = String(value); break;
        case 'fallback': this._fallback = String(value); break;
        case 'text': this._textValue = String(value); break;
        case 'textColor': this._color = value; break;
        case 'fontFamily': this._fontFamily = String(value); break;
        case 'fontWeight': this._fontWeight = value; break;
        case 'fontSize': this._fontSize = num(value, 32); break;
        case 'lineHeight': this._lineHeight = num(value, 1.2); break;
        case 'maxWidth': this._maxWidth = num(value, 0); break;
        case 'maxHeight': this._maxHeight = num(value, 0); break;
        case 'maxLines': this._maxLines = num(value, 0); break;
        case 'contain': this._contain = value || 'none'; break;
        case 'textAlign': this._textAlign = value || 'left'; break;
        case 'verticalAlign': this._verticalAlign = value || 'top'; break;
        case 'wordBreak': this._wordBreak = value || 'break-word'; break;
        case 'overflowSuffix': this._overflowSuffix = String(value); break;
        case 'letterSpacing': this._letterSpacing = num(value, 0); break;
        case 'offsetY': this._offsetY = num(value, 0); break;
        default: break;
      }
    }
  }

  // ---- identity / tree -------------------------------------------------

  get id() { return 'n' + this.uid; }
  get destroyed() { return this._destroyed; }
  get parentNode() { return this._parent; }
  get parent() { return this._parent; }
  set parent(value: RokuNode | null) {
    if (value === this._parent) return;
    if (this._parent) {
      const old = this._parent;
      this._parent = null;
      const i = old._children.indexOf(this);
      if (i >= 0) old._children.splice(i, 1);
      tmTransaction.removeNode(old.dom, this.dom);
      old.markTransform();
    }
    if (value) {
      this._parent = value;
      value._children.push(this);
      insertNode(value.dom, this.dom);
      // zIndex is normally set before the node is parented. Sorting here (not
      // only when zIndex changes later) is what puts nav/FPS/page/background
      // in the order the shared UI expects. All-zero-zIndex grids/lists keep
      // insertion order, so skip the reorder for the common case.
      if (this._zIndex !== 0 || value._children.some((child) => child._zIndex !== 0)) {
        value._orderDirty = true;
        value.renderer.markDirty(value);
      }
      value.markTransform();
    }
  }
  get children() { return this._children; }

  insertBefore(child: RokuNode, before?: RokuNode | null) {
    if (child.parent) {
      const i = child.parent._children.indexOf(child);
      if (i >= 0) child.parent._children.splice(i, 1);
      tmTransaction.removeNode(child.parent.dom, child.dom);
    }
    child._parent = this;
    const at = before ? this._children.indexOf(before) : -1;
    if (at < 0) this._children.push(child);
    else this._children.splice(at, 0, child);
    insertNode(this.dom, child.dom, before ? before.dom : undefined);
    if (child._zIndex !== 0 || this._children.some((c) => c._zIndex !== 0)) {
      this._orderDirty = true;
      this.renderer.markDirty(this);
    }
  }

  sortChildren() {
    this._orderDirty = true;
    this.renderer.markDirty(this);
  }

  private markOrder() {
    if (this._parent) this._parent._orderDirty = true;
    if (this._parent) this.renderer.markDirty(this._parent);
    else this.renderer.markDirty(this);
  }

  // ---- geometry / appearance -------------------------------------------

  get x() { return this._x; }
  set x(v: number) { if (v !== this._x) { this._x = num(v, 0); this.markTransform(); } }
  get y() { return this._y; }
  set y(v: number) { if (v !== this._y) { this._y = num(v, 0); this.markTransform(); } }
  get w() { return this._isText ? (this._layout ? this._layout.width : this._ownW) : this._w; }
  set w(v: number) {
    if (this._isText) this._maxWidth = num(v, 0);
    else this._w = num(v, 0);
    this.markTransform();
    // A rect/poster paints at boxW/boxH; resizing the node without marking the
    // visual leaves the Roku child at its old size (this kept the nav backdrop
    // at 200 px while its Group pivot moved as if it were 1600 px wide).
    if (!this._isText) this.markVisual();
    if (this._isText) this.reflowSoon();
  }
  get h() { return this._isText ? (this._layout ? this._layout.height : this._ownH) : this._h; }
  set h(v: number) {
    if (this._isText) this._maxHeight = num(v, 0);
    else this._h = num(v, 0);
    this.markTransform();
    if (!this._isText) this.markVisual();
    if (this._isText) this.reflowSoon();
  }
  get width() { return this.w; }
  set width(v: number) { this.w = v; }
  get height() { return this.h; }
  set height(v: number) { this.h = v; }

  get boxW() { return this._isText && this._layout ? this._layout.boxW : this._isText ? this._maxWidth : this._w; }
  get boxH() { return this._isText && this._layout ? this._layout.boxH : this._isText ? this._maxHeight : this._h; }

  get alpha() { return this._alpha; }
  set alpha(v: number) { this._alpha = Math.max(0, Math.min(1, num(v, 1))); this.markTransform(); }
  get visible() { return this._alpha > 0; }
  set visible(v: boolean) { this.alpha = v ? 1 : 0; }

  get color() { return this._color; }
  set color(v: number) { this._hasColor = true; this._color = v; this.markVisual(); this.effectDirty(); }
  get colorTop() { return this._colorTL; }
  set colorTop(v: number) { this._hasColor = true; this._colorTL = this._colorTR = v; this.markVisual(); this.effectDirty(); }
  get colorBottom() { return this._colorBL; }
  set colorBottom(v: number) { this._hasColor = true; this._colorBL = this._colorBR = v; this.markVisual(); this.effectDirty(); }
  get colorLeft() { return this._colorTL; }
  set colorLeft(v: number) { this._hasColor = true; this._colorTL = this._colorBL = v; this.markVisual(); this.effectDirty(); }
  get colorRight() { return this._colorTR; }
  set colorRight(v: number) { this._hasColor = true; this._colorTR = this._colorBR = v; this.markVisual(); this.effectDirty(); }
  get colorTopLeft() { return this._colorTL; }
  set colorTopLeft(v: number) { this._hasColor = true; this._colorTL = v; this._cornerColors = true; this.markVisual(); this.effectDirty(); }
  get colorTopRight() { return this._colorTR; }
  set colorTopRight(v: number) { this._hasColor = true; this._colorTR = v; this._cornerColors = true; this.markVisual(); this.effectDirty(); }
  get colorBottomLeft() { return this._colorBL; }
  set colorBottomLeft(v: number) { this._hasColor = true; this._colorBL = v; this._cornerColors = true; this.markVisual(); this.effectDirty(); }
  get colorBottomRight() { return this._colorBR; }
  set colorBottomRight(v: number) { this._hasColor = true; this._colorBR = v; this._cornerColors = true; this.markVisual(); this.effectDirty(); }

  get scale() { return this._scaleX; }
  set scale(v: number) {
    const s = num(v, 1);
    this._scaleX = s;
    this._scaleY = s;
    this.markTransform();
  }
  get scaleX() { return this._scaleX; }
  set scaleX(v: number) { this._scaleX = num(v, 1); this.markTransform(); }
  get scaleY() { return this._scaleY; }
  set scaleY(v: number) { this._scaleY = num(v, 1); this.markTransform(); }
  get mountX() { return this._mountX; }
  set mountX(v: number) { this._mountX = num(v, 0); this.markTransform(); }
  get mountY() { return this._mountY; }
  set mountY(v: number) { this._mountY = num(v, 0); this.markTransform(); }
  get pivotX() { return this._pivotX; }
  set pivotX(v: number) { this._pivotX = num(v, 0.5); this.markTransform(); }
  get pivotY() { return this._pivotY; }
  set pivotY(v: number) { this._pivotY = num(v, 0.5); this.markTransform(); }
  get rotation() { return this._rotation; }
  set rotation(v: number) { this._rotation = num(v, 0); this.markTransform(); }
  get zIndex() { return this._zIndex; }
  set zIndex(v: number) { this._zIndex = num(v, 0); this.markOrder(); }
  get rtlResolved(): boolean { return this._rtl === null ? (this._parent ? this._parent.rtlResolved : false) : this._rtl; }

  get clipping() { return this._clipping; }
  set clipping(v: any) {
    this._clipping = v === true || Array.isArray(v) ? v : false;
    this.markClip();
  }
  get clippingRect() {
    const x = this.absX;
    const y = this.absY;
    if (this._clipping === true) return { valid: true, x, y, w: this.boxW, h: this.boxH };
    if (Array.isArray(this._clipping)) return { valid: true, x: x + this._clipping[0], y: y + this._clipping[1], w: this._clipping[2], h: this._clipping[3] };
    return { valid: false, x: 0, y: 0, w: 0, h: 0 };
  }

  get absX(): number {
    const own = this._x - this._mountX * this.boxW;
    if (!this._parent) return own;
    let x = this._parent.absX + own;
    if (this.rtlResolved) x = this._parent.absX + (this._parent.boxW - this._x - this.boxW) - this._mountX * this.boxW;
    return x;
  }
  get absY(): number { return (this._parent ? this._parent.absY : 0) + this._y - this._mountY * this.boxH; }

  get renderState(): number {
    if (this._alpha <= 0) return 0;
    const x = this.absX;
    const y = this.absY;
    const w = this.boxW;
    const h = this.boxH;
    if (w <= 0 || h <= 0) return 0;
    return x < APP_W && y < APP_H && x + w > 0 && y + h > 0 ? 8 : 0;
  }

  // ---- resources --------------------------------------------------------

  get src() { return this._src || (this._texture ? this._texture.src : ''); }
  set src(v: string) {
    const raw = String(v || '');
    // The demo passes colors such as "#000000" or "#333" through `src` to
    // clear a background image. Treat a CSS color literal as a color, not a
    // bad URI. The web renderer accepts 3/4-digit shorthand; do the same.
    if (/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(raw)) {
      let hex = raw.slice(1);
      if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('') + 'ff';
      else if (hex.length === 4) hex = hex.split('').map((c) => c + c).join('');
      else hex = hex.padEnd(8, 'f');
      const color = parseInt(hex, 16) >>> 0;
      this._src = '';
      this.setTexture(null);
      this._color = color;
      this._colorTL = this._colorTR = this._colorBL = this._colorBR = color;
      this._hasColor = true;
      this.markVisual();
      return;
    }
    let source = raw;
    // SceneGraph Poster has no KTX decoder. The shared texture-compression
    // demo still needs a loaded texture and its timing; use the fixture poster
    // family as an explicit PNG stand-in and report the gap.
    if (/\.ktx(\?|$)/i.test(source)) {
      const id = Number((source.match(/image-(\d+)/) || [])[1] || 1);
      source = `pkg:/assets/offline/poster-${(id % 8) + 1}.png`;
      if (!(globalThis as any).__rokuKtxGap) {
        (globalThis as any).__rokuKtxGap = true;
        console.warn('ROKU_TEXTURE_GAP KTX is not decoded by Poster; using PNG stand-ins');
      }
    }
    const next = normalizeUri(source);
    if (next === this._src) return;
    this._src = next;
    this.markVisual();
    // SceneGraph does not guarantee an onLoadStatus callback for a cached
    // texture. Emit a bounded fallback so image-load driven pages complete;
    // a real status callback clears this timer and emits first.
    this._imageLoadedEmitted = false;
    if (this._imageLoadedTimer !== null) clearTimeout(this._imageLoadedTimer);
    this._imageLoadedTimer = setTimeout(() => {
      this._imageLoadedTimer = null;
      if (this._destroyed || this._imageLoadedEmitted) return;
      this._imageLoadedEmitted = true;
      this.emit('loaded', this, { type: 'image', dimensions: { width: this.boxW, height: this.boxH } });
    }, 300);
  }
  get texture() { return this._texture; }
  set texture(v: RokuTexture | null) { this.setTexture(v); this.markVisual(); }
  private setTexture(v: RokuTexture | null) {
    this._texture = v || null;
    this._sub = null;
    this._forceClip = false;
    if (v && v.textureType === 'SubTexture') {
      const p = v.props || {};
      this._sub = [num(p.x, 0), num(p.y, 0), num(p.w, 0), num(p.h, 0)];
      this._forceClip = true;
      this.markClip();
    }
  }
  get shader() { return this._shader; }
  set shader(v: ShaderHandle | null) { this.setShader(v); this.markVisual(); }
  private setShader(v: ShaderHandle | null) {
    if (this._shader === v) return;
    if (this._shader) this._shader.nodes.delete(this);
    this._shader = v || null;
    if (this._shader) this._shader.nodes.add(this);
    this.effectDirty();
  }
  get data() { return this._data; }
  set data(v: any) { this._data = v; }
  get textureOptions() { return this._textureOptions; }
  set textureOptions(v: any) { this._textureOptions = v; this.markVisual(); }
  get placeholderColor() { return this._placeholderColor; }
  set placeholderColor(v: any) { this._placeholderColor = v; this.markVisual(); }

  effectDirty() {
    this._effectDirty = true;
    this.renderer.markDirty(this);
  }
  markTransform() { this._transformDirty = true; this.renderer.markDirty(this); }
  markVisual() { this._visualDirty = true; this.renderer.markDirty(this); }
  markClip() { this._clipDirty = true; this.renderer.markDirty(this); }
  requestRender() { this.renderer.markDirty(this); }

  private _anims: Map<string, any> | null = null;
  private _fontFace: any = null;

  get text() { return this._textValue; }
  set text(v: string) {
    const next = v === undefined || v === null ? '' : String(v);
    if (next === this._textValue) return;
    this._textValue = next;
    this.reflow();
  }
  get fontFamily() { return this._fontFamily; }
  set fontFamily(v: string) { this._fontFamily = String(v || 'Roboto'); this.reflow(); }
  get fontWeight() { return this._fontWeight; }
  set fontWeight(v: any) { this._fontWeight = v; this.reflow(); }
  get fontSize() { return this._fontSize; }
  set fontSize(v: number) { this._fontSize = num(v, 32); this.reflow(); }
  get lineHeight() { return this._lineHeight; }
  set lineHeight(v: number) { this._lineHeight = num(v, 1.2); this.reflow(); }
  get maxWidth() { return this._maxWidth; }
  set maxWidth(v: number) { this._maxWidth = num(v, 0); this.reflow(); }
  get maxHeight() { return this._maxHeight; }
  set maxHeight(v: number) { this._maxHeight = num(v, 0); this.reflow(); }
  get maxLines() { return this._maxLines; }
  set maxLines(v: number) { this._maxLines = num(v, 0); this.reflow(); }
  get contain() { return this._contain; }
  set contain(v: TextContain) { this._contain = v || 'none'; this.reflow(); }
  get textAlign() { return this._textAlign; }
  set textAlign(v: TextAlign) { this._textAlign = v || 'left'; this.reflow(); }
  get verticalAlign() { return this._verticalAlign; }
  set verticalAlign(v: VerticalAlign) { this._verticalAlign = v || 'top'; this.reflow(); }
  get wordBreak() { return this._wordBreak; }
  set wordBreak(v: WordBreak) { this._wordBreak = v || 'break-word'; this.reflow(); }
  get overflowSuffix() { return this._overflowSuffix; }
  set overflowSuffix(v: string) { this._overflowSuffix = String(v); this.reflow(); }
  get letterSpacing() { return this._letterSpacing; }
  set letterSpacing(v: number) { this._letterSpacing = num(v, 0); this.reflow(); }
  get offsetY() { return this._offsetY; }
  set offsetY(v: number) { this._offsetY = num(v, 0); this.markVisual(); }
  get forceLoad() { return false; }
  set forceLoad(_v: boolean) { /* native fonts are always loaded up front */ }
  get layout() { return this._layout; }

  reflowSoon() {
    const defer = this.renderer.defer;
    if (typeof defer === 'function') defer(() => { if (!this._destroyed) this.reflow(); });
    else setTimeout(() => { if (!this._destroyed) this.reflow(); }, 0);
  }

  reflow() {
    if (!this._isText || this._destroyed) return;
    const parsed = weightOf(this._fontFamily, this._fontWeight);
    const uri = resolveFontUri(parsed.family, parsed.weight);
    try {
      const root = this.renderer.getFontRoot();
      if (root) this._fontFace = loadFace(uri, root, Math.max(1, Math.round(this._fontSize)));
    } catch (error) {
      console.error('ROKU_TEXT_FONT ' + uri + ' ' + String((error as any)?.message || error));
    }
    const metrics = fontMetrics(parsed.family, parsed.weight, this._fontSize);
    const layout = layoutText({
      text: this._textValue,
      measure: (value: string) => measureText(parsed.family, parsed.weight, this._fontSize, value),
      naturalLineHeight: metrics.lineHeight,
      fontSize: this._fontSize,
      lineHeight: this._lineHeight,
      maxWidth: this._maxWidth,
      maxHeight: this._maxHeight,
      maxLines: this._maxLines,
      textAlign: this._textAlign,
      verticalAlign: this._verticalAlign,
      contain: this._contain,
      wordBreak: this._wordBreak,
      overflowSuffix: this._overflowSuffix,
      letterSpacing: this._letterSpacing,
      offsetY: this._offsetY,
      rtl: this.rtlResolved,
    });
    this._layout = layout;
    this._lastFontVersion = getFontVersion();
    this._ownW = layout.width;
    this._ownH = layout.height;
    const key = [
      this._textValue, parsed.family, parsed.weight, this._fontSize, this._lineHeight,
      this._maxWidth, this._maxHeight, this._maxLines, this._contain, this._textAlign,
      this._verticalAlign, this._wordBreak, this._overflowSuffix, this._letterSpacing,
      this._offsetY, layout.width, layout.height, this._fontFace && this._fontFace.ready ? 1 : 0,
    ].join('|');
    if (key !== this._lastLayoutKey) {
      this._lastLayoutKey = key;
      this.queueLoaded();
    }
    this.markTransform();
    this.markVisual();
  }

  private queueLoaded() {
    if (this._loadedQueued) return;
    this._loadedQueued = true;
    setTimeout(() => {
      this._loadedQueued = false;
      if (this._destroyed) return;
      try {
        this.emit('loaded', {
          type: 'text',
          dimensions: { width: this._layout ? this._layout.width : 0, height: this._layout ? this._layout.height : 0 },
        });
      } catch (error) {
        console.error('ROKU_TEXT_LOADED ' + String((error as any)?.message || error));
      }
    }, 0);
  }

  // ---- visuals ----------------------------------------------------------

  private ensureVisual() {
    if (!this._isText && !this.src && !this._hasColor && !this._shader) {
      // Plain layout containers are transparent. Painting the default white
      // rectangle here covered the app background and every overlay that was
      // ordered before the container.
      return;
    }
    const type = this._isText ? 'label' : this.src ? 'poster' : 'rect';
    if (this.visual && (this.visual as any).__type === type) return;
    if (this.visual) {
      tmTransaction.removeNode(this.dom, this.visual);
      // The Effect node is a child of the visual; it is removed with it.
      this._effect = null;
    }
    const visual = createElement(type === 'label' ? 'label' : type === 'poster' ? 'poster' : 'rectangle');
    (visual as any).__type = type;
    this.visual = visual;
    this._written = {};
    if (this._children.length > 0) insertNode(this.dom, visual, this._children[0].dom);
    else insertNode(this.dom, visual);
    if (type === 'poster') this.hookPoster(visual);
    this._visualDirty = true;
    this._effectDirty = true;
  }

  private hookPoster(poster: any) {
    setProp(poster, 'onLoadStatus', (status: any) => {
      const value = String(status);
      if (value === 'loaded' || value === 'ready' || value === '3') {
        if (this._imageLoadedEmitted) return;
        this._imageLoadedEmitted = true;
        if (this._imageLoadedTimer !== null) { clearTimeout(this._imageLoadedTimer); this._imageLoadedTimer = null; }
        try {
          this.emit('loaded', this, {
            type: 'image',
            dimensions: { width: this.boxW, height: this.boxH },
          });
        } catch (error) {
          console.error('ROKU_IMAGE_LOADED ' + String((error as any)?.message || error));
        }
        return;
      }
      if (value !== 'failed') return;
      if (this._texture) this._texture.emit('failed');
      if (!this._fallback) return;
      const next = normalizeUri(this._fallback);
      if (!next || next === this._src) return;
      this._src = next;
      this._written.uri = undefined;
      this.markVisual();
    });
  }

  private writeIf(name: string, value: any) {
    if (this._written[name] !== undefined && same(this._written[name], value)) return;
    this._written[name] = Array.isArray(value) ? value.slice() : value;
    setProp(this.visual, name, value);
  }

  /** Group-level fields (transform and clipping); never the child visual. */
  private writeGroupIf(name: string, value: any) {
    if (this._writtenGroup[name] !== undefined && same(this._writtenGroup[name], value)) return;
    this._writtenGroup[name] = Array.isArray(value) ? value.slice() : value;
    setProp(this.dom, name, value);
  }

  private writeTransform() {
    let tx = this._x - this._mountX * this.boxW;
    if (this.rtlResolved && this._parent) {
      tx = this._parent.boxW - this._x - this.boxW - this._mountX * this.boxW;
    }
    const ty = this._y - this._mountY * this.boxH;
    this.writeGroupIf('translation', [tx, ty]);
    this.writeGroupIf('scale', [this._scaleX, this._scaleY]);
    this.writeGroupIf('rotation', this._rotation);
    this.writeGroupIf('scaleRotateCenter', [this._pivotX * this.boxW, this._pivotY * this.boxH]);
    let alpha = this._alpha;
    let cursor = this._parent;
    while (cursor) {
      alpha *= cursor.alpha;
      cursor = cursor.parentNode;
    }
    this.writeGroupIf('opacity', alpha);
  }

  private writeClip() {
    if (!this._clipping && !this._forceClip) {
      if (this._writtenGroup.clippingRect === undefined) return;
      this.writeGroupIf('clippingRect', [0, 0, 100000, 100000]);
      return;
    }
    if (this._rotation !== 0 && !(globalThis as any).__rokuClipRotateGap) {
      (globalThis as any).__rokuClipRotateGap = true;
      console.warn('ROKU_CLIP_GAP rotated clipping uses the unrotated rect');
    }
    const rect = Array.isArray(this._clipping) ? this._clipping : [0, 0, this.boxW, this.boxH];
    this.writeGroupIf('clippingRect', [
      rect[0] - this._margins[0],
      rect[1] - this._margins[1],
      rect[2] + this._margins[0] + this._margins[2],
      rect[3] + this._margins[1] + this._margins[3],
    ]);
  }

  private writeVisual() {
    if (!this.visual) return;
    const type = (this.visual as any).__type;
    const w = Math.max(0, this.boxW);
    const h = Math.max(0, this.boxH);
    if (type === 'rect') {
      this.writeIf('width', w);
      this.writeIf('height', h);
      const vertical = this._colorTL !== this._colorBL;
      const horizontal = this._colorTL !== this._colorTR;
      const diagonal = vertical && horizontal;
      // Single-axis gradients use a solid start colour under the alpha-ramp
      // Poster; diagonal/per-corner gradients keep the band approximation.
      this.writeIf('color', vertical || horizontal
        ? (diagonal || this._cornerColors ? '0x00000000' : toRokuColor(this._colorTL, '0x00000000'))
        : toRokuColor(this._color, '0x00000000'));
      return;
    }
    if (type === 'poster') {
      if (this._sub) {
        // Crop a sprite-sheet region. Roku's Poster has no source-rect field:
        // draw the full sheet unscaled inside the clipped Group and translate
        // it. The Poster must be exactly the sheet size, otherwise noScale
        // centres the bitmap and the region is lost.
        const [sx, sy, sw, sh] = this._sub;
        const sheet = sheetSize(this.src);
        if (sheet !== null) {
          this.writeIf('width', sheet[0]);
          this.writeIf('height', sheet[1]);
          this.writeIf('loadDisplayMode', 'noScale');
          this.writeIf('translation', [-sx, -sy]);
        } else {
          this.writeIf('width', w);
          this.writeIf('height', h);
          this.writeIf('loadDisplayMode', 'scaleToFill');
          if (!(globalThis as any).__rokuSubTextureGap) {
            (globalThis as any).__rokuSubTextureGap = true;
            console.warn('ROKU_TEXTURE_GAP SubTexture crop needs the sheet dimensions for ' + this.src);
          }
        }
      } else {
        this.writeIf('width', w);
        this.writeIf('height', h);
        const resizeMode = this._textureOptions && this._textureOptions.resizeMode;
        const contained =
          this._contain === 'both' ||
          resizeMode === 'contain' ||
          (resizeMode && (resizeMode.type === 'contain' ||
            (resizeMode.x === 'contain' && resizeMode.y === 'contain')));
        const zoomed =
          resizeMode && (resizeMode.type === 'cover' || resizeMode.type === 'zoom' ||
            (resizeMode.x === 'cover' && resizeMode.y === 'cover'));
        this.writeIf('loadDisplayMode', contained ? 'scaleToFit' : zoomed ? 'scaleToZoom' : 'scaleToFill');
      }
      // A poster cannot take a gradient blend. The tint is drawn as black-alpha
      // bands above the poster (see writeEffect), matching a white→black
      // multiply for the common hero style.
      this.writeIf('blendColor', toRokuColor(this._color, '0xFFFFFFFF'));
      this.writeIf('shaderCompatible', !!this._shader);
      if (this._placeholder) this.writeIf('loadingBitmapUri', normalizeUri(this._placeholder));
      if (this._fallback) this.writeIf('failedBitmapUri', normalizeUri(this._fallback));
      const uri = this.src;
      if (this._written.uri !== uri) {
        this._written.uri = uri;
        setProp(this.visual, 'uri', uri);
      }
      if (this._colorTL !== this._colorTR || this._colorTL !== this._colorBL || this._colorTL !== this._colorBR) {
        if (!(globalThis as any).__rokuColorGap) {
          (globalThis as any).__rokuColorGap = true;
          console.warn('ROKU_COLOR_GAP per-corner colors collapse to the top-left color');
        }
      }
      return;
    }
    if (type === 'label' && this._layout) {
      const parsed = weightOf(this._fontFamily, this._fontWeight);
      const natural = fontMetrics(parsed.family, parsed.weight, this._fontSize).lineHeight;
      // CSS line-height can be tighter than the font's natural line box.
      // Negative spacing is valid and is what keeps 32px body copy at 32px
      // instead of the font's 34px default.
      const extra = Math.round(this._layout.lineHeightPx - natural);
      const lineText = this._layout.lines.map((line) => line.text).join('\n');      if (this._fontFace && this._fontFace.node) this.writeIf('font', this._fontFace.node);
      // Native glyph advances are not perfectly linear with the 32pt
      // measurement face. Auto-width labels need a small margin or Roku
      // ellipsizes the last glyph. Box-constrained text keeps its exact width.
      const autoWidth = this._maxWidth === 0;
      const labelW = autoWidth
        ? Math.ceil(this._layout.labelW * 1.08) + 8
        : Math.max(1, this._layout.labelW);
      // The layout's boxY resolves verticalAlign inside the text box. Roku's
      // Label paints its first line at the top of the line box, so add the CSS
      // half-leading (extra / 2) to reproduce text centered in lineHeight. This
      // is what puts Play/Resume, HD/CC and nav labels in the middle of their
      // fixed-height containers instead of at the top.
      const labelH = Math.max(1, Math.ceil(this._layout.height) + 8);
      this.writeIf('width', labelW);
      this.writeIf('height', labelH);
      this.writeIf('text', lineText);
      this.writeIf('wrap', true);
      this.writeIf('maxLines', this._maxLines > 0 ? this._maxLines : 0);
      this.writeIf('lineSpacing', extra);
      this.writeIf('horizAlign', this._textAlign);
      this.writeIf('vertAlign', 'top');
      this.writeIf('color', toRokuColor(this._color, '0xFFFFFFFF'));
      this.writeIf('translation', [0, this._layout.boxY + extra / 2]);
      if (this._letterSpacing !== 0 && !(globalThis as any).__rokuLetterGap) {
        (globalThis as any).__rokuLetterGap = true;
        console.warn('ROKU_TEXT_GAP letterSpacing is measured but not drawn by the native Label');
      }
    }
  }

  // Roku applies an Effect only when the Effect node is a child of the node it
  // affects. A detached node assigned to `effect` is silently ignored, which
  // left every colorTop/colorBottom gradient flat.
  private ensureEffect(): RokuEffect {
    if (!this._effect) {
      this._effect = new RokuEffect();
      if (this.visual) insertNode(this.visual, this._effect.node);
    }
    return this._effect;
  }

  private clearGradientOverlay() {
    if (!this._gradientOverlay) return;
    try { tmTransaction.removeNode(this.dom, this._gradientOverlay); } catch (e) { /* detached */ }
    this._gradientOverlay = null;
    this._gradientOverlayKey = '';
  }

  private reorderGradientOverlay() {
    if (!this._gradientOverlay) return;
    const before = this._children.length > 0 ? this._children[0].dom : undefined;
    insertNode(this.dom, this._gradientOverlay, before);
  }

  /**
   * A smooth single-axis gradient: a solid base colour plus a white-to-alpha
   * ramp Poster tinted with the end colour. One extra node instead of hundreds
   * of rectangles, and no visible banding.
   */
  private updateGradientOverlay(vertical: boolean, horizontal: boolean, tint: boolean) {
    const w = Math.max(1, this.boxW);
    const h = Math.max(1, this.boxH);
    const uri = vertical ? 'pkg:/assets/gradient-alpha-v.png' : 'pkg:/assets/gradient-alpha-h.png';
    const to = vertical ? this._colorBL : this._colorTR;
    const key = `${tint ? 't' : 'c'}${vertical ? 1 : 0}${horizontal ? 1 : 0}:${w}x${h}:${to}`;
    if (!this._gradientOverlay) {
      this._gradientOverlay = createElement('poster');
      setProp(this._gradientOverlay, 'loadDisplayMode', 'scaleToFill');
    }
    if (this._gradientOverlayKey !== key) {
      this._gradientOverlayKey = key;
      setProp(this._gradientOverlay, 'uri', uri);
      setProp(this._gradientOverlay, 'blendColor', tint ? '0x000000FF' : toRokuColor(to, '0xFFFFFFFF'));
      setProp(this._gradientOverlay, 'width', Math.ceil(w));
      setProp(this._gradientOverlay, 'height', Math.ceil(h));
      setProp(this._gradientOverlay, 'translation', [0, 0]);
    }
    this.clearGradientBands();
    this.reorderGradientOverlay();
  }

  private clearGradientBands() {
    if (!this._bands.length) return;
    for (const band of this._bands) {
      try { tmTransaction.removeNode(this.dom, band.node); } catch (e) { /* already detached */ }
    }
    this._bands = [];
    this._bandKey = '';
  }

  private reorderBands() {
    if (!this._bands.length) return;
    const before = this._children.length > 0 ? this._children[0].dom : undefined;
    for (const band of this._bands) insertNode(this.dom, band.node, before);
  }

  /**
   * Roku's Effect gradient is not applied reliably on this firmware, so
   * colorTop/colorBottom (and left/right) are painted as a stack of thin
   * rectangles. At 16-32 bands the step is at most one RGB unit on a 1080p
   * background, and the result is ordinary SceneGraph geometry that also
   * clips, animates and z-orders with its parent.
   */
  private updateGradientBands(vertical: boolean, horizontal: boolean, overlay = false) {
    const w = Math.max(1, this.boxW);
    const h = Math.max(1, this.boxH);
    const key = `${overlay ? 'o' : 'c'}${vertical ? 1 : 0}${horizontal ? 1 : 0}:${w}x${h}:${this._colorTL}:${this._colorBL}:${this._colorTR}:${this._colorBR}`;
    if (key === this._bandKey) {
      this.reorderBands();
      return;
    }
    this._bandKey = key;
    const longest = vertical ? h : w;
    // Large surfaces (full-screen page backgrounds) need a finer ramp; the
    // 32-band approximation was visibly striped on the Gradients page.
    const maxBands = overlay ? 32 : longest >= 700 ? 256 : longest >= 300 ? 96 : 32;
    const target = overlay ? Math.ceil(longest / 16) : Math.ceil(longest / 8);
    const count = Math.max(2, Math.min(maxBands, target));
    while (this._bands.length < count) {
      const node = createElement('rectangle');
      this._bands.push({ node, color: -1 });
    }
    while (this._bands.length > count) {
      const band = this._bands.pop()!;
      try { tmTransaction.removeNode(this.dom, band.node); } catch (e) { /* already detached */ }
    }
    const from = this._colorTL;
    const to = vertical ? this._colorBL : this._colorTR;
    const luminance = (value: any) => {
      const n = parseInt(toRokuColor(value, '0xFFFFFFFF').slice(2), 16) >>> 0;
      return (0.2126 * ((n >>> 24) & 255) + 0.7152 * ((n >>> 16) & 255) + 0.0722 * ((n >>> 8) & 255)) / 255;
    };
    const fromAlpha = overlay ? 1 - luminance(from) : 0;
    const toAlpha = overlay ? 1 - luminance(to) : 0;
    for (let i = 0; i < count; i++) {
      const band = this._bands[i];
      const t = count <= 1 ? 0 : i / (count - 1);
      const color = overlay
        ? // Roku colours are 0xRRGGBBAA: black with the alpha in the low byte.
          ((Math.round((fromAlpha + (toAlpha - fromAlpha) * t) * 255) & 255) >>> 0)
        : lerpColor(from, to, t);
      if (band.color !== color) {
        band.color = color;
        setProp(band.node, 'color', toRokuColor(color));
      }
      if (vertical) {
        setProp(band.node, 'width', Math.ceil(w));
        setProp(band.node, 'height', Math.ceil(h / count) + 1);
        setProp(band.node, 'translation', [0, (h * i) / count]);
      } else {
        setProp(band.node, 'width', Math.ceil(w / count) + 1);
        setProp(band.node, 'height', Math.ceil(h));
        setProp(band.node, 'translation', [(w * i) / count, 0]);
      }
    }
    this.reorderBands();
  }

  private writeEffect() {
    if (!this.visual) return;
    if (this._shader && (this.visual as any).__type !== 'label') {
      const effect = this.ensureEffect();
      effect.apply(this._shader.name, this._shader.props, this.boxW, this.boxH);
      this.writeIf('effect', effect.node);
    } else if ((this.visual as any).__type === 'label' && this._shader) {
      if (!(globalThis as any).__rokuTextEffectGap) {
        (globalThis as any).__rokuTextEffectGap = true;
        console.warn('ROKU_EFFECT_GAP Label cannot take an Effect; text shader is not drawn');
      }
    } else if ((this.visual as any).__type === 'rect') {
      const vertical = this._colorTL !== this._colorBL;
      const horizontal = this._colorTL !== this._colorTR;
      const diagonal = vertical && horizontal;
      if (vertical || horizontal) {
        if (diagonal || this._cornerColors) {
          if (this._cornerColors && !(globalThis as any).__rokuCornerGap) {
            (globalThis as any).__rokuCornerGap = true;
            console.warn('ROKU_COLOR_GAP per-corner colors use a banded approximation');
          }
          this.clearGradientOverlay();
          this.updateGradientBands(vertical, horizontal);
        } else {
          this.updateGradientOverlay(vertical, horizontal, false);
        }
        if (this._written.effect !== undefined) this.writeIf('effect', null);
      } else {
        this.clearGradientBands();
        this.clearGradientOverlay();
        if (this._written.effect !== undefined) this.writeIf('effect', null);
      }
    } else if ((this.visual as any).__type === 'poster') {
      const vertical = this._colorTL !== this._colorBL;
      const horizontal = this._colorTL !== this._colorTR;
      const diagonal = vertical && horizontal;
      if (vertical || horizontal) {
        if (diagonal) {
          this.clearGradientOverlay();
          this.updateGradientBands(vertical, horizontal, true);
        } else {
          this.updateGradientOverlay(vertical, horizontal, true);
        }
        if (this._written.effect !== undefined) this.writeIf('effect', null);
      } else {
        this.clearGradientBands();
        this.clearGradientOverlay();
        if (this._written.effect !== undefined) this.writeIf('effect', null);
      }
    } else {
      this.clearGradientBands();
      if (this._written.effect !== undefined) this.writeIf('effect', null);
    }
  }

  private reorder() {
    const sorted = this._children.slice().sort((a, b) => a.zIndex - b.zIndex);
    if (this.visual) {
      // The node's own visual paints below its children. Insert it before the
      // first child; a plain append here put focused button/card backgrounds
      // over their text.
      if (sorted.length > 0) insertNode(this.dom, this.visual, sorted[0].dom);
      else insertNode(this.dom, this.visual);
    }
    for (let i = 0; i < sorted.length; i++) insertNode(this.dom, sorted[i].dom);
    this.reorderGradientOverlay();
    this.reorderBands();
  }

  flush() {
    if (this._destroyed) return;
    if (this._isText && this._lastFontVersion !== getFontVersion()) this.reflow();
    this.ensureVisual();
    if (this._orderDirty) {
      this._orderDirty = false;
      this.reorder();
    }
    if (this._transformDirty) {
      this._transformDirty = false;
      this.writeTransform();
    }
    if (this._clipDirty) {
      this._clipDirty = false;
      this.writeClip();
    }
    if (this._visualDirty) {
      this._visualDirty = false;
      this.writeVisual();
    }
    if (this._effectDirty) {
      this._effectDirty = false;
      this.writeEffect();
    }
  }

  // ---- animation --------------------------------------------------------

  animate(props: any, settings: any = {}) {
    const animator = this.renderer.animator;
    if (!animator) return null;
    const controller = animator.create(this, props || {}, settings, () => this.renderer.ensureTicker());
    if (!this._anims) this._anims = new Map();
    for (const key in props || {}) this._anims.set(key, { settings, controller });
    return controller;
  }

  animateProp(name: string, value: number, settings: any = {}) {
    const animator = this.renderer.animator;
    if (!animator) return null;
    if (!this._anims) this._anims = new Map();
    const color = isColorKey(name);
    const existing = this._anims.get(name);
    // Colour animations restart from the current colour. Retargeting the
    // progress-based colour animation would replace its 0..1 progress target
    // with a colour value.
    if (!color && existing && existing.settings === settings) {
      existing.controller.retarget(value);
      return existing.controller;
    }
    if (existing) existing.controller.stop();
    const controller = animator.create(this, { [name]: value }, settings, () => this.renderer.ensureTicker());
    this._anims.set(name, { settings, controller });
    return controller.start();
  }

  animation(name: string) {
    const entry = this._anims ? this._anims.get(name) : undefined;
    return entry ? entry.controller : undefined;
  }
  get animations() { return this._anims || new Map(); }
  setAnimationValue(name: string, value: any) { (this as any)[name] = value; }
  stopAnimation(name: string) {
    const animation = this.animation(name);
    if (animation) animation.stop();
  }
  stopAnimations() {
    if (this._anims) this._anims.forEach((entry) => entry.controller.stop());
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this.renderer.animator) this.renderer.animator.removeFor(this);
    const kids = this._children.slice();
    for (let i = 0; i < kids.length; i++) kids[i].destroy();
    this._children.length = 0;
    if (this._shader) this._shader.nodes.delete(this);
    if (this._imageLoadedTimer !== null) { clearTimeout(this._imageLoadedTimer); this._imageLoadedTimer = null; }
    this.clearGradientBands();
    this.clearGradientOverlay();
    if (this._effect) {
      try { tmTransaction.removeNode(this.visual || this.dom, this._effect.node); } catch (e) { /* already detached */ }
      this._effect = null;
    }
    if (this.visual) {
      try { tmTransaction.removeNode(this.dom, this.visual); } catch (e) { /* already detached */ }
      this.visual = null;
    }
    const parentDom = this.dom && this.dom.parent;
    if (parentDom) {
      try { tmTransaction.removeNode(parentDom, this.dom); } catch (e) { /* already detached */ }
    }
    if (this._parent) {
      const i = this._parent._children.indexOf(this);
      if (i >= 0) this._parent._children.splice(i, 1);
      this._parent = null;
    }
    this.removeAllListeners();
  }
}

