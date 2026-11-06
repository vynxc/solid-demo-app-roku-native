/**
 * Map SolidTV shader/effect props to the Roku OS 16 Effect node.
 *
 * Roku's Effect is not arbitrary WebGL: it provides rounded corners, a single
 * outside border, and linear/radial gradients. The mapping below is exact for
 * those features and records a capability gap (never a silent success) for
 * the ones the node cannot express, so a parity report can be derived from the
 * running app rather than guessed.
 */
import { createElement, setProp } from '@roku-sdk/solid';

export function toRokuColor(value: any, fallback = '0x00000000'): string {
  if (typeof value === 'string') {
    if (value.startsWith('0x') || value.startsWith('0X')) return value;
    if (value.startsWith('#')) {
      let hex = value.slice(1);
      // CSS shorthand: #rgb and #rgba. Expanding here keeps every caller
      // (color, colorTop, src-as-color) consistent.
      if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('') + 'ff';
      else if (hex.length === 4) hex = hex.split('').map((c) => c + c).join('');
      else hex = hex.padEnd(8, 'f');
      return '0x' + hex.toUpperCase();
    }
    return fallback;
  }
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'function') {
    try { return toRokuColor(value(), fallback); } catch (e) { /* fall through */ }
  }
  let n = Number(value);
  if (!Number.isFinite(n) && typeof value === 'object') {
    // Some renderer styles hand us a colour wrapper rather than a uint32.
    // Solid proxies can also be cyclic, so never JSON-serialise here.
    for (const key of ['value', 'color', 'argb', 'rgba', 'get']) {
      const v = value[key];
      if (typeof v === 'function') {
        try {
          const out = v.call(value);
          if (out !== undefined && out !== value) return toRokuColor(out, fallback);
        } catch (e) { /* ignore */ }
      } else if (typeof v === 'string') {
        return toRokuColor(v, fallback);
      } else if (typeof v === 'number' && Number.isFinite(v)) {
        n = v;
        break;
      }
    }
    if (!Number.isFinite(n)) {
      const r = Number(value.r), g = Number(value.g), b = Number(value.b), a = Number(value.a);
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
        const scale = r <= 1 && g <= 1 && b <= 1 ? 255 : 1;
        const alpha = Number.isFinite(a) ? (a <= 1 ? a * 255 : a) : 255;
        n = (((r * scale) & 255) << 24) | (((g * scale) & 255) << 16) | (((b * scale) & 255) << 8) | (alpha & 255);
      }
    }
    if (!Number.isFinite(n)) {
      // Solid style objects can wrap a string/number. String() unwraps a
      // primitive proxy without walking its (possibly cyclic) structure.
      try {
        const text = String(value);
        if (/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(text) || /^0x[0-9a-fA-F]+$/.test(text)) {
          return toRokuColor(text, fallback);
        }
        if (/^\d+$/.test(text)) n = Number(text);
      } catch (e) { /* fall through */ }
    }
  }
  if (!Number.isFinite(n)) return fallback;
  return '0x' + (n >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

const toNumber = (v: any, d: number): number => {
  const n = Number(v);
  return Number.isNaN(n) ? d : n;
};

function radiusOf(props: any): number | number[] | null {
  const r = props.radius !== undefined ? props.radius : props.rounded !== undefined ? props.rounded?.radius : props.borderRadius;
  if (r === undefined || r === null) return null;
  if (Array.isArray(r)) return r.map((v: any) => toNumber(v, 0));
  return toNumber(r, 0);
}

interface BorderInfo {
  width: number;
  color: string;
  padding: number;
  sides: [number, number, number, number];
  inset: boolean;
  perSide: boolean;
}

function borderOf(props: any): BorderInfo | null {
  const border = props.border;
  const widths: [number, number, number, number] = [
    toNumber(props['border-top'] ?? border?.width, 0),
    toNumber(props['border-right'] ?? border?.width, 0),
    toNumber(props['border-bottom'] ?? border?.width, 0),
    toNumber(props['border-left'] ?? border?.width, 0),
  ];
  const w = props['border-w'];
  if (w !== undefined) {
    if (Array.isArray(w)) {
      widths[0] = toNumber(w[0], 0);
      widths[1] = toNumber(w[1], 0);
      widths[2] = toNumber(w[2], 0);
      widths[3] = toNumber(w[3], 0);
    } else {
      const n = toNumber(w, 0);
      widths[0] = widths[1] = widths[2] = widths[3] = n;
    }
  }
  const maxW = Math.max(widths[0], widths[1], widths[2], widths[3]);
  if (!(maxW > 0)) return null;
  const perSide = !(widths[0] === widths[1] && widths[1] === widths[2] && widths[2] === widths[3]);
  const align = props['border-align'] ?? border?.align ?? 'inside';
  const inset = align === 'inside' && props['border-inset'] !== false && border?.inset !== false;
  return {
    width: maxW,
    color: toRokuColor(props['border-color'] ?? border?.color ?? 0xffffffff),
    padding: toNumber(props['border-gap'] ?? border?.gap, 0),
    sides: widths,
    inset,
    perSide,
  };
}

function gradientOf(name: string, props: any): { style: 'linear' | 'radial'; colors: string[]; stops: number[]; angle: number; centre: [number, number]; radius: [number, number] } | null {
  const raw = props.colors;
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const colors = raw.slice(0, 8).map((v: any) => toRokuColor(v));
  let stops: number[] = Array.isArray(props.stops) ? props.stops.slice(0, 8).map((v: any) => toNumber(v, 0)) : [];
  if (stops.length !== colors.length) {
    stops = colors.map((_, i) => (colors.length === 1 ? 0 : i / (colors.length - 1)));
  }
  const isRadial = name === 'radialGradient' || props.radial === true;
  const angle = isRadial ? 0 : (toNumber(props.angle, 0) * 180) / Math.PI;
  const centre: [number, number] = Array.isArray(props.pivot) ? [toNumber(props.pivot[0], 0.5), toNumber(props.pivot[1], 0.5)] : [0.5, 0.5];
  const radius: [number, number] = isRadial
    ? [toNumber(props.w, 50), toNumber(props.h, 50)]
    : [0.5, 0.5];
  return { style: isRadial ? 'radial' : 'linear', colors, stops, angle, centre, radius };
}

export interface EffectReport {
  applied: boolean;
  rounded: boolean;
  border: boolean;
  gradient: boolean;
  gaps: string[];
}

const reported = new Set<string>();
function reportGap(name: string) {
  if (reported.has(name)) return;
  reported.add(name);
  console.warn('ROKU_EFFECT_GAP ' + name);
}

/**
 * One Effect node plus the last values written. A node's shader props are
 * mutable in place in SolidTV, so {@link apply} is called again whenever the
 * owning shader handle reports a write.
 */
export class RokuEffect {
  node: any;
  private values: Record<string, any> = {};
  private gaps: string[] = [];
  private applied = false;

  constructor() {
    this.node = createElement('effect');
  }

  private set(name: string, value: any) {
    if (this.values[name] === value) return;
    // Arrays compare by content because SolidTV writes fresh arrays.
    if (Array.isArray(value) && Array.isArray(this.values[name])) {
      const prev = this.values[name] as any[];
      if (prev.length === value.length && prev.every((v, i) => v === value[i])) return;
    }
    this.values[name] = Array.isArray(value) ? value.slice() : value;
    setProp(this.node, name, value);
  }

  apply(name: string, props: any, w: number, h: number): EffectReport {
    const gaps: string[] = [];
    const radius = radiusOf(props);
    if (radius !== null && (Array.isArray(radius) ? radius.some((r) => r > 0) : radius > 0)) {
      this.set('borderRadius', radius);
    } else {
      this.set('borderRadius', 0);
    }

    const border = borderOf(props);
    if (border !== null) {
      this.set('borderWidth', border.width);
      this.set('borderColor', border.color);
      this.set('borderPadding', border.padding);
      if (border.perSide) gaps.push('per-side border widths collapsed to the widest side');
      // Roku's border is outside the content rectangle. SolidTV's default is
      // an inset border; drawing it outside changes the outer geometry. It is
      // still a real border, so record the exact difference rather than drop
      // it.
      if (border.inset) gaps.push('inset border drawn outside the content rectangle');
    } else {
      this.set('borderWidth', 0);
    }

    const gradient = gradientOf(name, props);
    if (gradient !== null) {
      this.set('gradientStyle', gradient.style);
      this.set('gradientColors', gradient.colors);
      this.set('gradientStops', gradient.stops);
      if (gradient.style === 'linear') {
        this.set('gradientAngle', gradient.angle);
      } else {
        this.set('gradientCentre', gradient.centre);
        const rw = w > 0 ? gradient.radius[0] / w : 0.5;
        const rh = h > 0 ? gradient.radius[1] / h : 0.5;
        this.set('gradientRadius', [rw, rh]);
        if (gradient.radius[0] !== gradient.radius[1]) gaps.push('non-circular radial gradient radius is approximated per axis');
      }
    } else {
      this.set('gradientStyle', 'none');
    }

    // SolidTV packs the box shadow into the rounded shader as prefixed props:
    // `shadow-projection` is [x, y, blur, spread]. Roku OS 16's Effect node has
    // no DropShadow fields (each write returns FieldNotFound), so the renderer
    // draws the shadow with a pre-blurred Poster behind the node instead
    // (see RokuNode.updateShadow).
    if (/shadow/i.test(name) || props['shadow-color'] !== undefined || props.shadow !== undefined) {
      gaps.push('shadow is drawn by a pre-blurred Poster, not the Effect node');
    }
    if (name === 'holePunch') {
      gaps.push('holePunch has no native Effect equivalent (MaskGroup needed)');
      reportGap('holePunch');
    }
    if (name === 'radialProgress') {
      gaps.push('radialProgress has no native Effect equivalent');
      reportGap('radialProgress');
    }
    this.gaps = gaps;
    this.applied = true;
    return { applied: true, rounded: radius !== null, border: border !== null, gradient: gradient !== null, gaps };
  }

  destroy() {
    this.values = {};
    this.gaps = [];
    this.applied = false;
  }
}
