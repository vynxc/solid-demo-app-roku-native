/**
 * Line breaker for the SceneGraph text adapter.
 *
 * SolidTV's renderer measures text in device pixels and breaks lines at word
 * boundaries, honouring maxWidth/maxHeight/maxLines, the three word-break
 * modes, explicit newlines, the overflow suffix and letter spacing. Roku's
 * Label does its own breaking, but SolidTV's flex layout needs the resulting
 * box size *synchronously*, so the same decisions have to be available here
 * before the Label is ever drawn. This module computes that geometry; the
 * Label is then given the identical box, alignment and line spacing.
 *
 * Measurements come from the native FontMeasure API through {@link MeasureFn}
 * (see fonts.ts), scaled to the requested font size.
 */
export type TextAlign = 'left' | 'center' | 'right';
export type VerticalAlign = 'top' | 'middle' | 'bottom';
export type TextContain = 'none' | 'width' | 'height' | 'both';
export type WordBreak = 'overflow' | 'break-all' | 'break-word';

export interface TextLayoutInput {
  text: string;
  /** Width of `text` at `fontSize` in pixels. */
  measure: (text: string) => number;
  /** Optional web-renderer measurement used only for line-break decisions. */
  measureWrap?: (text: string) => number;
  /** Font's natural line height at `fontSize`, in pixels. */
  naturalLineHeight: number;
  /** Font size in pixels; CSS line-height multipliers apply to this. */
  fontSize: number;
  /** SolidTV lineHeight: a multiplier at or below 3, else pixels. */
  lineHeight: number;
  maxWidth: number;
  maxHeight: number;
  maxLines: number;
  textAlign: TextAlign;
  verticalAlign: VerticalAlign;
  contain: TextContain;
  wordBreak: WordBreak;
  overflowSuffix: string;
  letterSpacing: number;
  offsetY: number;
  rtl: boolean;
}

export interface TextLine {
  text: string;
  width: number;
}

export interface TextLayoutResult {
  lines: TextLine[];
  /** Widest line, in pixels: the text node's own `w`. */
  width: number;
  /** lines.length * line height: the text node's own `h`. */
  height: number;
  lineHeightPx: number;
  /** The box mount/pivot use (contain max size when set). */
  boxW: number;
  boxH: number;
  boxX: number;
  boxY: number;
  /** Label width/height to write to SceneGraph. */
  labelW: number;
  labelH: number;
  truncated: boolean;
  effectiveMaxLines: number;
  /** lineSpacing to write to a Roku Label. */
  lineSpacing: number;
}

const clampLines = (lines: TextLine[], limit: number, suffix: string, measure: (s: string) => number): [TextLine[], boolean] => {
  if (limit <= 0 || lines.length <= limit) return [lines, false];
  const kept = lines.slice(0, limit);
  const last = kept[limit - 1];
  // Best-effort ellipsis on the final visible line.
  const suffixW = suffix.length > 0 ? measure(suffix) : 0;
  let source = last.text;
  if (suffixW > 0) {
    // The caller's maxWidth is applied below; here we only make room for the
    // suffix. Trimming one character at a time is fine for the short labels
    // this demo uses and keeps the decision measurable.
    kept[limit - 1] = { text: source + suffix, width: last.width + suffixW };
  }
  return [kept, true];
};

const breakLongWord = (word: string, maxWidth: number, measure: (s: string) => number): string[] => {
  const parts: string[] = [];
  let current = '';
  for (let i = 0; i < word.length; i++) {
    const next = current + word[i];
    if (current.length > 0 && measure(next) > maxWidth) {
      parts.push(current);
      current = word[i];
    } else {
      current = next;
    }
  }
  if (current.length > 0) parts.push(current);
  return parts;
};

export function layoutText(input: TextLayoutInput): TextLayoutResult {
  const measureBase = input.measure;
  // Letter spacing is part of the measured advance in CSS. Add it once here so
  // wrapping, maxLines and the reported box width all agree with the renderer
  // contract (the native Label itself still cannot draw the extra advance).
  const measure = (text: string) =>
    measureBase(text) + Math.max(0, text.length - 1) * (input.letterSpacing || 0);
  const measureWrapBase = input.measureWrap || measureBase;
  const measureWrap = (text: string) =>
    measureWrapBase(text) + Math.max(0, text.length - 1) * (input.letterSpacing || 0);
  const natural = input.naturalLineHeight > 0 ? input.naturalLineHeight : input.lineHeight > 3 ? input.lineHeight : 16;
  // The web baseline uses CSS line-height, whose unitless multipliers are
  // relative to the font size. Multiplying the *natural* line box instead
  // makes every multi-line block ~15% taller than the browser.
  // Match the web renderer: unitless lineHeight multiplies the font's
  // natural line box; zero means the default (also the natural line box).
  const lineHeightPx = input.lineHeight > 3
    ? input.lineHeight
    : input.lineHeight > 0
      ? input.lineHeight * natural
      : natural;
  const maxWidth = input.maxWidth > 0 ? input.maxWidth : 0;
  const maxHeight = input.maxHeight > 0 ? input.maxHeight : 0;

  let effectiveMaxLines = input.maxLines > 0 ? input.maxLines : 0;
  if (maxHeight > 0 && lineHeightPx > 0) {
    const fromHeight = Math.max(1, Math.floor(maxHeight / lineHeightPx));
    if (effectiveMaxLines === 0 || fromHeight < effectiveMaxLines) effectiveMaxLines = fromHeight;
  }

  const lines: TextLine[] = [];
  const paragraphs = String(input.text == null ? '' : input.text).split('\n');

  for (let p = 0; p < paragraphs.length; p++) {
    const paragraph = paragraphs[p];
    if (maxWidth <= 0) {
      lines.push({ text: paragraph, width: measure(paragraph) });
      continue;
    }
    if (paragraph.length === 0) {
      lines.push({ text: '', width: 0 });
      continue;
    }

    // Words and their separators. Keeping the spaces preserves normal word
    // spacing when a line is assembled.
    const tokens = paragraph.match(/\S+|\s+/g) || [paragraph];
    let current = '';
    let currentWidth = 0;

    for (let t = 0; t < tokens.length; t++) {
      const token = tokens[t];
      const tokenWidth = measureWrap(token);
      const isSpace = /^\s+$/.test(token);

      if (isSpace) {
        // A space never starts a line.
        if (current.length === 0) continue;
        if (currentWidth + tokenWidth <= maxWidth) {
          current += token;
          currentWidth += tokenWidth;
        } else {
          lines.push({ text: current.replace(/\s+$/, ''), width: measure(current.replace(/\s+$/, '')) });
          current = '';
          currentWidth = 0;
        }
        continue;
      }

      const candidate = current + token;
      const candidateWidth = measureWrap(candidate);
      if (candidateWidth <= maxWidth || current.length === 0) {
        if (candidateWidth > maxWidth && current.length === 0 && input.wordBreak !== 'overflow') {
          // Single word wider than the line: break it into characters.
          const parts = breakLongWord(token, maxWidth, measureWrap);
          for (let i = 0; i < parts.length - 1; i++) {
            lines.push({ text: parts[i], width: measure(parts[i]) });
          }
          current = parts[parts.length - 1] || '';
          currentWidth = measureWrap(current);
        } else {
          current = candidate;
          currentWidth = candidateWidth;
        }
      } else {
        lines.push({ text: current.replace(/\s+$/, ''), width: measure(current.replace(/\s+$/, '')) });
        current = token;
        currentWidth = tokenWidth;
        if (currentWidth > maxWidth && input.wordBreak !== 'overflow') {
          const parts = breakLongWord(current, maxWidth, measureWrap);
          for (let i = 0; i < parts.length - 1; i++) {
            lines.push({ text: parts[i], width: measure(parts[i]) });
          }
          current = parts[parts.length - 1] || '';
          currentWidth = measure(current);
        }
      }
    }
    if (current.length > 0 || lines.length === 0) {
      lines.push({ text: current.replace(/\s+$/, ''), width: measure(current.replace(/\s+$/, '')) });
    }
  }

  let truncated = false;
  let visible = lines;
  if (effectiveMaxLines > 0 && lines.length > effectiveMaxLines) {
    const result = clampLines(lines, effectiveMaxLines, input.overflowSuffix, measure);
    visible = result[0];
    truncated = result[1];
    // Ensure the ellipsised line actually fits.
    if (truncated && maxWidth > 0) {
      const last = visible[visible.length - 1];
      while (last.text.length > 0 && measureWrap(last.text) > maxWidth) {
        const cut = last.text.endsWith(input.overflowSuffix)
          ? last.text.slice(0, last.text.length - input.overflowSuffix.length - 1) + input.overflowSuffix
          : last.text.slice(0, -1);
        last.text = cut;
      }
      last.width = measure(last.text);
    }
  }

  let width = 0;
  for (let i = 0; i < visible.length; i++) {
    if (visible[i].width > width) width = visible[i].width;
  }
  const height = visible.length * lineHeightPx;

  const inWidth = (input.contain === 'width' || input.contain === 'both') && maxWidth > 0;
  const inHeight = (input.contain === 'height' || input.contain === 'both') && maxHeight > 0;
  const boxW = inWidth ? maxWidth : width;
  const boxH = inHeight ? maxHeight : height;

  let boxX = 0;
  const align = input.rtl ? (input.textAlign === 'left' ? 'right' : input.textAlign === 'right' ? 'left' : 'center') : input.textAlign;
  if (inWidth && align === 'right') boxX = maxWidth - width;
  else if (inWidth && align === 'center') boxX = (maxWidth - width) * 0.5;

  let boxY = 0;
  const slack = (inHeight ? maxHeight : height) - height;
  if (slack > 0) {
    if (input.verticalAlign === 'bottom') boxY = slack;
    else if (input.verticalAlign === 'middle') boxY = slack * 0.5;
  }
  boxY += input.offsetY;

  // The Label gets the box, not the line: its own horizAlign/vertAlign then
  // place the block exactly where `place()` puts it in the WebGL renderer.
  const labelW = inWidth ? maxWidth : width;
  const labelH = inHeight ? maxHeight : height;
  const lineSpacing = lineHeightPx - natural;

  return {
    lines: visible,
    width,
    height,
    lineHeightPx,
    boxW,
    boxH,
    boxX,
    boxY,
    labelW,
    labelH,
    truncated,
    effectiveMaxLines,
    lineSpacing,
  };
}
