/**
 * Native font faces and measurement for the SceneGraph renderer.
 *
 * SolidTV's flex layout asks a text node for its width synchronously. Roku
 * can only measure a font once the firmware has published it, and there is no
 * synchronous "load this font now" call. The renderer therefore waits for a
 * small set of base faces (Roboto regular/bold, Raleway) during startup and
 * measures at a fixed base size; every requested size is that measurement
 * scaled linearly, which is how the renderer's own NormalizedFontMetrics work
 * too. Once the base faces are ready, all text measurement is synchronous.
 */
import { createElement, insertNode, setProp } from '@roku-sdk/solid';
import { getFontMeasure, whenFontReady } from '@roku-sdk/rsg-ts/runtime';
import type { TmNodeRef } from '@roku-sdk/interfaces';
import { FONT_METRICS, measureMsdf } from './font-metrics';

export const BASE_FONT_SIZE = 32;

const ROBOTO_REGULAR = 'pkg:/fonts/Roboto-Regular.ttf';
const ROBOTO_BOLD = 'pkg:/fonts/Roboto-Bold.ttf';
const RALEWAY_BOLD = 'pkg:/fonts/Raleway-ExtraBold.ttf';

export interface FontFace {
  key: string;
  uri: string;
  size: number;
  node: any;
  ref: TmNodeRef | null;
  ready: boolean;
  failed: boolean;
  /** Natural line height at BASE_FONT_SIZE. */
  lineHeight: number;
  ascent: number;
  descent: number;
  /** Per-text width cache at BASE_FONT_SIZE. */
  widths: Map<string, number>;
  /** Measurement retries after a transient getOneLineWidth failure. */
  retries: number;
  retryTimer: any;
}

const faces = new Map<string, FontFace>();
let measureApi: any = null;
let measureApiError: string | null = null;
let fontVersion = 0;

/** Increments whenever a face becomes measurable. */
export function getFontVersion(): number {
  return fontVersion;
}

/**
 * Tell the live renderer that text metrics changed. Bumping the version alone
 * is not enough: a dirty-driven renderer only reflows nodes it is asked to
 * flush, so a face that becomes measurable after first paint would otherwise
 * leave auto-width text at its stale zero width.
 */
export function notifyFontChanged(): void {
  fontVersion++;
  const renderer = (globalThis as any).__rokuRenderer;
  if (renderer && typeof renderer.onFontVersionChanged === 'function') {
    renderer.onFontVersionChanged();
  }
}

function api(): any {
  if (measureApi !== null) return measureApi;
  if (measureApiError !== null) return null;
  try {
    measureApi = getFontMeasure();
    return measureApi;
  } catch (e) {
    measureApiError = String((e as any)?.message ?? e);
    console.error('ROKU_FONT_MEASURE unavailable: ' + measureApiError);
    return null;
  }
}

/** Map a SolidTV family/weight to a bundled TTF. */
export function resolveFontUri(fontFamily: string | undefined, fontWeight?: number | string): string {
  const family = String(fontFamily || 'Roboto');
  const weightText = String(fontWeight === undefined ? '' : fontWeight);
  const bold =
    /bold|black|heavy|semibold|demibold/i.test(family) ||
    /bold|black|heavy|semibold|demibold/i.test(weightText) ||
    (Number(weightText) >= 600 && !Number.isNaN(Number(weightText)));
  if (/raleway/i.test(family)) return RALEWAY_BOLD;
  return bold ? ROBOTO_BOLD : ROBOTO_REGULAR;
}

function cacheWidth(face: FontFace, text: string): number {
  let w = face.widths.get(text);
  if (w !== undefined) return w;
  if (face.ref === null || !face.ready) return 0;
  const m = api();
  if (m === null) return 0;
  try {
    w = Number(m.getOneLineWidth(face.ref, text, 1920) ?? 0);
  } catch (e) {
    // The first measurement can race font publication. Retry on a timer and
    // ask the renderer to reflow; permanently marking the face unready here
    // left auto-width labels (the keyboard action keys) at 8 px.
    if (face.retries < 6) {
      face.retries++;
      if (face.retryTimer === null || face.retryTimer === undefined) {
        face.retryTimer = setTimeout(() => {
          face.retryTimer = null;
          notifyFontChanged();
        }, 120);
      }
    } else {
      face.ready = false;
    }
    console.error('ROKU_FONT_MEASURE failed: ' + String((e as any)?.stack || (e as any)?.message || e));
    return 0;
  }
  if (face.widths.size > 4000) face.widths.clear();
  face.widths.set(text, w);
  return w;
}

/** Width of `text` at `fontSize` pixels. Returns 0 until the face is ready. */
export function measureText(fontFamily: string | undefined, fontWeight: number | string | undefined, fontSize: number, text: string): number {
  const uri = resolveFontUri(fontFamily, fontWeight);
  const size = Math.max(1, Math.round(fontSize));
  // Prefer the exact face the Label uses. Roku unloads a Font node that no
  // visible Label references, so the 32 pt measurement face can report
  // "Font is not yet loaded" after boot even though its object is still in
  // our map. The per-size face is kept loaded by the Label that uses it.
  const exact = faces.get(uri + '@' + size);
  const face = exact !== undefined && exact.ready ? exact : faces.get(uri);
  if (face === undefined || !face.ready) return 0;
  return (cacheWidth(face, text) * fontSize) / face.size;
}

/**
 * Web renderer line-box ratio for the fonts the shared app configures.
 * `src/fonts.ts` overrides Roboto's metrics to ascender 1000 / descender 100 /
 * unitsPerEm 1000 (bare line height 0.9 x fontSize); Raleway uses its JSON
 * metrics (940 - (-234)) / 1000. Layout must use these, not Roku's FontMeasure
 * line box, or multi-line blocks are one line-height too tall.
 */
export function webLineHeight(fontFamily: string | undefined, fontWeight: number | string | undefined, fontSize: number): number {
  const uri = resolveFontUri(fontFamily, fontWeight);
  if (uri === RALEWAY_BOLD) return 1.174 * fontSize;
  return 0.9 * fontSize;
}

/**
 * Width using the web renderer's MSDF advances, for line-breaking decisions.
 * Falls back to the native TTF measurement when the face is not in the table.
 */
export function measureWrapText(fontFamily: string | undefined, fontWeight: number | string | undefined, fontSize: number, text: string): number {
  const uri = resolveFontUri(fontFamily, fontWeight);
  const metrics = FONT_METRICS[uri];
  if (metrics === undefined) return measureText(fontFamily, fontWeight, fontSize, text);
  return (measureMsdf(metrics, text) * fontSize) / metrics.size;
}

export function fontMetrics(fontFamily: string | undefined, fontWeight: number | string | undefined, fontSize: number) {
  const uri = resolveFontUri(fontFamily, fontWeight);
  const size = Math.max(1, Math.round(fontSize));
  const exact = faces.get(uri + '@' + size);
  if (exact !== undefined && exact.ready) {
    return { lineHeight: exact.lineHeight, ascent: exact.ascent, descent: exact.descent };
  }
  const face = faces.get(uri);
  const scale = fontSize / BASE_FONT_SIZE;
  if (face === undefined || !face.ready) {
    return { lineHeight: fontSize * 1.2, ascent: fontSize * 0.8, descent: fontSize * 0.2 };
  }
  return { lineHeight: face.lineHeight * scale, ascent: face.ascent * scale, descent: face.descent * scale };
}

export function isFontReady(fontFamily: string | undefined, fontWeight?: number | string): boolean {
  const face = faces.get(resolveFontUri(fontFamily, fontWeight));
  return face !== undefined && face.ready;
}

export function anyFontReady(): boolean {
  for (const face of faces.values()) if (face.ready) return true;
  return false;
}

/**
 * Create a Font node at the measurement size, publish it (preUpdate before
 * uri/size, per the SDK's font rules) and wait for the firmware to make it
 * measurable. The node is attached to `root` so it is part of the scene; a
 * Font node draws nothing.
 */
export function loadFace(uri: string, root: any, size: number = BASE_FONT_SIZE): FontFace {
  const faceSize = Math.max(1, Math.round(size));
  // The base face is the measurement font; every distinct render size needs
  // its own Font node because SceneGraph Labels take their size from `font`.
  const key = faceSize === BASE_FONT_SIZE ? uri : uri + '@' + faceSize;
  const existing = faces.get(key);
  if (existing !== undefined) return existing;

  const node = createElement('font');
  const face: FontFace = {
    key,
    uri,
    size: faceSize,
    node,
    ref: null,
    ready: false,
    failed: false,
    lineHeight: BASE_FONT_SIZE * 1.2,
    ascent: BASE_FONT_SIZE * 0.8,
    descent: BASE_FONT_SIZE * 0.2,
    widths: new Map(),
    retries: 0,
    retryTimer: null,
  };
  faces.set(key, face);
  try {
    // The documented order: preUpdate first, then uri and size.
    setProp(node, 'preUpdate', true);
    setProp(node, 'uri', uri);
    setProp(node, 'size', faceSize);
    if (root !== undefined && root !== null) {
      // Attach it so the firmware publishes it even where a detached Font
      // node with preUpdate is not enough.
      insertNode(root, node);
    }
    face.ref = (node as any).r as TmNodeRef;
  } catch (e) {
    face.failed = true;
    console.error('ROKU_FONT create failed ' + uri + ': ' + String((e as any)?.message ?? e));
    return face;
  }

  const m = api();
  const ready = (ref: TmNodeRef) => {
    if (face.ready) return;
    face.ready = true;
    try {
      face.lineHeight = m.getOneLineHeight(ref);
      face.ascent = m.getAscent(ref);
      face.descent = m.getDescent(ref);
    } catch (e) {
      face.ready = false;
      console.error('ROKU_FONT metrics failed ' + uri + ': ' + String((e as any)?.message ?? e));
    }
    if (face.ready) notifyFontChanged();
  };

  if (m !== null && face.ref !== null) {
    try {
      // Already published (a warm start or a repeated face): no await needed.
      if (m.getOneLineHeight(face.ref) > 0) ready(face.ref);
    } catch (e) {
      /* not published yet */
    }
  }
  if (!face.ready && face.ref !== null) {
    whenFontReady(face.ref).then(
      () => ready(face.ref!),
      (e: any) => {
        face.failed = true;
        console.error('ROKU_FONT load failed ' + uri + ': ' + String(e?.message ?? e));
      },
    );
  }
  return face;
}

/**
 * Load the bundled faces used by the demo. Returns when all have settled
 * (ready or failed) so the first layout has real metrics.
 */
export async function loadBundledFonts(root: any): Promise<void> {
  console.log('ROKU_FONTS begin');
  const uris = [ROBOTO_REGULAR, ROBOTO_BOLD, RALEWAY_BOLD];
  const pending = uris.map((uri) => {
    const face = loadFace(uri, root);
    if (face.ready || face.failed || face.ref === null) return Promise.resolve();
    // Never hold the first frame on a font that the firmware has not published
    // yet. The version counter reflows text once it does become measurable.
    return Promise.race([
      whenFontReady(face.ref),
      new Promise<void>((resolve) => setTimeout(resolve, 2500)),
    ]).then(
      () => {
        if (!face.ready) {
          try {
            const m = api();
            face.ready = true;
            face.lineHeight = m.getOneLineHeight(face.ref!);
            face.ascent = m.getAscent(face.ref!);
            face.descent = m.getDescent(face.ref!);
          } catch (e) {
            face.ready = false;
          }
          if (face.ready) notifyFontChanged();
        }
      },
      () => {
        face.failed = true;
      },
    );
  });
  await Promise.all(pending);
  console.log(
    'ROKU_FONTS ' +
      Array.from(faces.values())
        .map((f) => `${f.uri}:${f.ready ? 'ready' : f.failed ? 'failed' : 'pending'}`)
        .join(' '),
  );
}
