// Pure, dependency-free color + typography math. Runs in BOTH the UI iframe and
// the Figma sandbox, so it must never touch the DOM or the `figma` global.

import type { ColorSpace, ColorFamilyInput, ColorRole, TypeStyle } from './types';

export interface RGB {
  r: number; // 0–255
  g: number; // 0–255
  b: number; // 0–255
}

export interface RGBA01 {
  r: number; // 0–1
  g: number; // 0–1
  b: number; // 0–1
  a: number; // 0–1
}

export interface HSL {
  h: number; // 0–360
  s: number; // 0–100
  l: number; // 0–100
}

export interface HSV {
  h: number; // 0–360
  s: number; // 0–100
  v: number; // 0–100
}

export interface OKLCH {
  l: number; // 0–1
  c: number; // 0–~0.4
  h: number; // 0–360
}

// ---------------------------------------------------------------------------
// Hex <-> RGB
// ---------------------------------------------------------------------------

export function hexToRgb(hex: string): RGB {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) {
    h = h
      .split('')
      .map((ch) => ch + ch)
      .join('');
  }
  const num = Number.parseInt(h, 16);
  if (Number.isNaN(num)) return { r: 0, g: 0, b: 0 };
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff,
  };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const toHex = (n: number) => clamp255(n).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

// ---------------------------------------------------------------------------
// RGB <-> HSL
// ---------------------------------------------------------------------------

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s: s * 100, l: l * 100 };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] = hueSegment(hp, c, x);
  const m = ln - c / 2;
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
}

// ---------------------------------------------------------------------------
// RGB <-> HSV (a.k.a. HSB)
// ---------------------------------------------------------------------------

export function rgbToHsv({ r, g, b }: RGB): HSV {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : d / max;
  return { h, s: s * 100, v: max * 100 };
}

export function hsvToRgb({ h, s, v }: HSV): RGB {
  const sn = s / 100;
  const vn = v / 100;
  const c = vn * sn;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] = hueSegment(hp, c, x);
  const m = vn - c;
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
}

function hueSegment(hp: number, c: number, x: number): [number, number, number] {
  if (hp < 1) return [c, x, 0];
  if (hp < 2) return [x, c, 0];
  if (hp < 3) return [0, c, x];
  if (hp < 4) return [0, x, c];
  if (hp < 5) return [x, 0, c];
  return [c, 0, x];
}

// ---------------------------------------------------------------------------
// RGB <-> OKLCH  (linear sRGB -> OKLab -> OKLCH, Björn Ottosson matrices)
// ---------------------------------------------------------------------------

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export function rgbToOklch({ r, g, b }: RGB): OKLCH {
  const lr = srgbToLinear(r / 255);
  const lg = srgbToLinear(g / 255);
  const lb = srgbToLinear(b / 255);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const okL = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const okA = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const okB = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const c = Math.sqrt(okA * okA + okB * okB);
  let h = (Math.atan2(okB, okA) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: okL, c, h };
}

export function oklchToRgb({ l: okL, c, h }: OKLCH): RGB {
  const hr = (h * Math.PI) / 180;
  const okA = c * Math.cos(hr);
  const okB = c * Math.sin(hr);

  const l_ = okL + 0.3963377774 * okA + 0.2158037573 * okB;
  const m_ = okL - 0.1055613458 * okA - 0.0638541728 * okB;
  const s_ = okL - 0.0894841775 * okA - 1.291485548 * okB;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return {
    r: clamp255(linearToSrgb(lr) * 255),
    g: clamp255(linearToSrgb(lg) * 255),
    b: clamp255(linearToSrgb(lb) * 255),
  };
}

export function rgbToFigmaRgba({ r, g, b }: RGB, a = 1): RGBA01 {
  return { r: r / 255, g: g / 255, b: b / 255, a };
}

// ---------------------------------------------------------------------------
// Palette generation
// ---------------------------------------------------------------------------

export const SCALE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

// Perceptual lightness ramp (lightest -> darkest), one value per step above.
const OKLCH_LIGHTNESS = [0.975, 0.95, 0.9, 0.83, 0.74, 0.64, 0.55, 0.46, 0.38, 0.3, 0.24];
const HSL_LIGHTNESS = [97, 93, 86, 76, 66, 56, 48, 40, 32, 24, 18];
const HSV_VALUE = [99, 97, 94, 90, 85, 78, 68, 58, 48, 38, 30];

// Ease chroma/saturation at the extremes so tints/shades stay in gamut and don't
// look muddy. Peaks around the 400–500 steps.
const CHROMA_SCALE = [0.4, 0.55, 0.72, 0.86, 0.96, 1.0, 0.98, 0.92, 0.82, 0.7, 0.6];
const SAT_SCALE = [0.6, 0.72, 0.82, 0.9, 0.96, 1.0, 1.0, 0.98, 0.92, 0.85, 0.8];

export interface ScaleStep {
  step: number;
  hex: string;
  rgb: RGB;
}

/**
 * Build an 11-step palette (50…950) from a base color, holding hue constant and
 * walking a fixed perceptual lightness ramp in the chosen color space.
 */
export function generateScale(baseHex: string, space: ColorSpace): ScaleStep[] {
  const baseRgb = hexToRgb(baseHex);

  if (space === 'oklch') {
    const base = rgbToOklch(baseRgb);
    return SCALE_STEPS.map((step, i) => {
      const rgb = oklchToRgb({ l: OKLCH_LIGHTNESS[i], c: base.c * CHROMA_SCALE[i], h: base.h });
      return { step, hex: rgbToHex(rgb), rgb };
    });
  }

  if (space === 'hsl') {
    const base = rgbToHsl(baseRgb);
    return SCALE_STEPS.map((step, i) => {
      const rgb = hslToRgb({ h: base.h, s: base.s * SAT_SCALE[i], l: HSL_LIGHTNESS[i] });
      return { step, hex: rgbToHex(rgb), rgb };
    });
  }

  // hsb / hsv
  const base = rgbToHsv(baseRgb);
  return SCALE_STEPS.map((step, i) => {
    const rgb = hsvToRgb({ h: base.h, s: base.s * SAT_SCALE[i], v: HSV_VALUE[i] });
    return { step, hex: rgbToHex(rgb), rgb };
  });
}

// ---------------------------------------------------------------------------
// Typography / modular scale
// ---------------------------------------------------------------------------

export type TypeCategory = 'display' | 'heading' | 'body' | 'label';

/** Numeric weight (100–900) → Figma font style name. */
export const WEIGHT_TO_STYLE: Record<number, string> = {
  100: 'Thin',
  200: 'Extra Light',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semi Bold',
  700: 'Bold',
  800: 'Extra Bold',
  900: 'Black',
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface StyleSeed {
  name: string;
  step: number;
  category: TypeCategory;
  weights: number[];
}

// The default type styles the plugin seeds on first load / reset. Users can add,
// rename, and delete from here — this is a starting point, not a fixed set.
const DEFAULT_STYLE_SEED: StyleSeed[] = [
  { name: 'Display', step: 6, category: 'display', weights: [700] },
  { name: 'Heading 1', step: 5, category: 'heading', weights: [700] },
  { name: 'Heading 2', step: 4, category: 'heading', weights: [700] },
  { name: 'Heading 3', step: 3, category: 'heading', weights: [600] },
  { name: 'Heading 4', step: 2, category: 'heading', weights: [600] },
  { name: 'Body', step: 0, category: 'body', weights: [400, 600] },
  { name: 'Caption', step: -1, category: 'body', weights: [400] },
  { name: 'Label', step: -1.5, category: 'label', weights: [600] },
];

/** A computed type style minus its UI-generated `id`. */
export type SeededTypeStyle = Omit<TypeStyle, 'id'>;

/**
 * Seed the default type styles from a base size and modular scale ratio.
 * Category rules apply tight line-height / negative tracking to Display and
 * Headings, relaxed line-height to Body, and uppercase + wide tracking to Label.
 * Every seeded style keeps a numeric `step`, so it tracks the scale until pinned.
 */
export function defaultTypeStyles(
  baseSize: number,
  ratio: number,
  multiplier = 1,
): SeededTypeStyle[] {
  return DEFAULT_STYLE_SEED.map((seed) => {
    const fontSize = Math.round(baseSize * Math.pow(ratio, seed.step) * multiplier);

    let lhFactor: number;
    let tracking: number;
    let textCase: 'ORIGINAL' | 'UPPER' = 'ORIGINAL';

    switch (seed.category) {
      case 'display':
        lhFactor = 1.1;
        tracking = fontSize * -0.02;
        break;
      case 'heading':
        lhFactor = 1.2;
        tracking = fontSize * -0.01;
        break;
      case 'label':
        lhFactor = 1.4;
        tracking = fontSize * 0.06;
        textCase = 'UPPER';
        break;
      case 'body':
      default:
        lhFactor = 1.5;
        tracking = 0;
        break;
    }

    return {
      name: seed.name,
      step: seed.step,
      fontSize,
      lineHeight: Math.round(fontSize * lhFactor),
      letterSpacing: round2(tracking),
      textCase,
      weights: [...seed.weights],
    };
  });
}

/**
 * Resolve the text-style name for a given weight. A single-weight style keeps its
 * bare name ("Body"); a multi-weight style suffixes the weight ("Body/Bold").
 */
export function resolveStyleName(name: string, weight: number, weightsCount: number): string {
  if (weightsCount <= 1) return name;
  return `${name}/${WEIGHT_TO_STYLE[weight] ?? 'Regular'}`;
}

// ---------------------------------------------------------------------------
// Layered semantic tokens (Radix / shadcn / Stripe style)
// ---------------------------------------------------------------------------

export interface SemanticTokenSpec {
  name: string;
  role: ColorRole;
  /** Used for action/secondary: fall back to this role when `role` is unassigned. */
  fallback?: ColorRole;
  lightStep: number;
  darkStep: number;
}

// Each token aliases the family assigned its `role`, at lightStep / darkStep.
export const SEMANTIC_TOKENS: SemanticTokenSpec[] = [
  // Surface
  { name: 'bg/canvas', role: 'neutral', lightStep: 100, darkStep: 950 },
  { name: 'bg/surface', role: 'neutral', lightStep: 50, darkStep: 900 },
  { name: 'bg/subtle', role: 'neutral', lightStep: 100, darkStep: 900 },
  { name: 'bg/muted', role: 'neutral', lightStep: 200, darkStep: 800 },
  { name: 'bg/inverse', role: 'neutral', lightStep: 900, darkStep: 100 },
  // Content
  { name: 'text/primary', role: 'neutral', lightStep: 900, darkStep: 50 },
  { name: 'text/secondary', role: 'neutral', lightStep: 600, darkStep: 400 },
  { name: 'text/disabled', role: 'neutral', lightStep: 400, darkStep: 600 },
  { name: 'text/on-accent', role: 'neutral', lightStep: 50, darkStep: 50 },
  { name: 'text/inverse', role: 'neutral', lightStep: 50, darkStep: 900 },
  // Border
  { name: 'border/default', role: 'neutral', lightStep: 200, darkStep: 800 },
  { name: 'border/strong', role: 'neutral', lightStep: 300, darkStep: 700 },
  { name: 'border/focus', role: 'primary', lightStep: 500, darkStep: 400 },
  // Action
  { name: 'action/primary', role: 'primary', lightStep: 600, darkStep: 500 },
  { name: 'action/primary-hover', role: 'primary', lightStep: 700, darkStep: 400 },
  { name: 'action/secondary', role: 'secondary', fallback: 'neutral', lightStep: 200, darkStep: 800 },
  // Feedback
  { name: 'success', role: 'success', lightStep: 600, darkStep: 500 },
  { name: 'warning', role: 'warning', lightStep: 500, darkStep: 400 },
  { name: 'danger', role: 'danger', lightStep: 600, darkStep: 500 },
];

const REQUIRED_ROLES: ColorRole[] = ['neutral', 'primary'];

export interface ResolvedToken {
  token: string;
  lightFamily: string;
  lightStep: number;
  darkFamily: string;
  darkStep: number;
}

export interface SemanticResolution {
  /** Tokens that resolved to a family, ready to write as Light/Dark aliases. */
  plan: ResolvedToken[];
  /** Optional roles referenced by a token but unassigned — reported, not fatal. */
  skipped: ColorRole[];
  /** Required roles (neutral/primary) missing — the caller should abort the pass. */
  missingRequired: ColorRole[];
}

/**
 * Map the semantic token table onto the families' explicit roles. Each token
 * aliases the same family in both modes; action/secondary falls back to neutral.
 * First family wins when a role is duplicated. Pure — no `figma`, no DOM.
 */
export function resolveSemanticTokens(families: ColorFamilyInput[]): SemanticResolution {
  const familyForRole = (role: ColorRole): string | undefined =>
    families.find((f) => f.role === role)?.name;

  const plan: ResolvedToken[] = [];
  const skippedSet = new Set<ColorRole>();

  for (const token of SEMANTIC_TOKENS) {
    const family =
      familyForRole(token.role) ?? (token.fallback ? familyForRole(token.fallback) : undefined);
    if (!family) {
      skippedSet.add(token.role);
      continue;
    }
    plan.push({
      token: token.name,
      lightFamily: family,
      lightStep: token.lightStep,
      darkFamily: family,
      darkStep: token.darkStep,
    });
  }

  const missingRequired = REQUIRED_ROLES.filter((r) => !familyForRole(r));
  const skipped = [...skippedSet].filter((r) => !REQUIRED_ROLES.includes(r)).sort();

  return { plan, skipped, missingRequired };
}

// ---------------------------------------------------------------------------
// Universal design system (spacing / radii / elevation)
// One opinionated token set distilled from Stripe, Vercel, Apple HIG, and
// Material 3: a base-4 spacing scale with a fine micro step, a shape scale from
// sharp to pill, and five crisp elevation levels. All values are plain data so
// they can be previewed in the UI and written by the sandbox unchanged.
// ---------------------------------------------------------------------------

export interface TokenValue {
  /** Suffix after the group prefix, e.g. "2" -> space/2, "md" -> radius/md. */
  name: string;
  /** Pixel value written to the variable. */
  value: number;
}

/** Base-4 spacing with a 2px micro step (space/1) for fine interactive padding. */
export const SPACING_SCALE: TokenValue[] = [
  { name: '0', value: 0 },
  { name: '1', value: 2 },
  { name: '2', value: 4 },
  { name: '3', value: 8 },
  { name: '4', value: 12 },
  { name: '5', value: 16 },
  { name: '6', value: 20 },
  { name: '7', value: 24 },
  { name: '8', value: 32 },
  { name: '9', value: 40 },
  { name: '10', value: 48 },
  { name: '11', value: 64 },
  { name: '12', value: 96 },
];

/** Shape scale: sharp inner elements → soft cards → pill. `full` is a large px. */
export const RADIUS_SCALE: TokenValue[] = [
  { name: 'none', value: 0 },
  { name: 'xs', value: 4 },
  { name: 'sm', value: 6 },
  { name: 'md', value: 8 },
  { name: 'lg', value: 12 },
  { name: 'xl', value: 16 },
  { name: '2xl', value: 24 },
  { name: 'full', value: 9999 },
];

export interface ElevationLevel {
  level: number;
  /** Shadow offset X / Y in px. */
  x: number;
  y: number;
  /** Blur radius in px. */
  blur: number;
  /** Spread in px (negative tightens the shadow). */
  spread: number;
  /** Shadow alpha as a percentage (0–100), applied to the shadow tint. */
  opacity: number;
}

/** Five levels of crisp elevation; opacity climbs and shadows soften with height. */
export const ELEVATION_LEVELS: ElevationLevel[] = [
  { level: 1, x: 0, y: 1, blur: 2, spread: 0, opacity: 5 },
  { level: 2, x: 0, y: 2, blur: 4, spread: -1, opacity: 8 },
  { level: 3, x: 0, y: 4, blur: 8, spread: -2, opacity: 10 },
  { level: 4, x: 0, y: 8, blur: 16, spread: -4, opacity: 12 },
  { level: 5, x: 0, y: 16, blur: 24, spread: -6, opacity: 14 },
];

/** Cool near-black default for the shadow tint; editable in the UI. */
export const DEFAULT_SHADOW_TINT = '#101828';

/** Elevation number-variable names for a level, e.g. elevation/2/blur. */
export function elevationVarNames(level: number): { prop: keyof Omit<ElevationLevel, 'level'>; name: string }[] {
  return (['x', 'y', 'blur', 'spread', 'opacity'] as const).map((prop) => ({
    prop,
    name: `elevation/${level}/${prop}`,
  }));
}

// ---------------------------------------------------------------------------
// Extended foundation token layers
// The remaining token layers an industry-standard design system carries, beyond
// the spacing/radii/elevation above: motion (duration + easing), opacity + state
// layers, border widths, z-index, focus ring, and icon sizes. One opinionated,
// merged set distilled from the W3C DTCG taxonomy and Material 3 / Tailwind / Radix.
// Kept as plain data (scopes as strings, cast to VariableScope in the sandbox) so
// this module stays free of the `figma` global and previews in the UI unchanged.
// ---------------------------------------------------------------------------

export interface SystemTokenGroup {
  /** Variable group prefix, e.g. "duration" -> duration/fast. */
  prefix: string;
  /** UI section heading, e.g. "Motion · Duration". */
  label: string;
  type: 'FLOAT' | 'STRING';
  /** Figma VariableScope names applied in the sandbox; [] leaves the default. */
  scopes: string[];
  tokens: { name: string; value: number | string }[];
}

export const SYSTEM_TOKEN_GROUPS: SystemTokenGroup[] = [
  {
    prefix: 'duration',
    label: 'Motion · Duration',
    type: 'FLOAT',
    scopes: [],
    tokens: [
      { name: 'instant', value: 100 },
      { name: 'fast', value: 150 },
      { name: 'normal', value: 200 },
      { name: 'slow', value: 300 },
      { name: 'slower', value: 400 },
      { name: 'slowest', value: 500 },
    ],
  },
  {
    prefix: 'easing',
    label: 'Motion · Easing',
    type: 'STRING',
    scopes: [],
    tokens: [
      { name: 'linear', value: 'cubic-bezier(0, 0, 1, 1)' },
      { name: 'standard', value: 'cubic-bezier(0.2, 0, 0, 1)' },
      { name: 'emphasized', value: 'cubic-bezier(0.05, 0.7, 0.1, 1)' },
      { name: 'decelerate', value: 'cubic-bezier(0, 0, 0, 1)' },
      { name: 'accelerate', value: 'cubic-bezier(0.3, 0, 1, 1)' },
    ],
  },
  {
    prefix: 'opacity',
    label: 'Opacity',
    type: 'FLOAT',
    scopes: ['OPACITY'],
    tokens: [
      { name: 'disabled', value: 0.38 },
      { name: 'muted', value: 0.6 },
      { name: 'backdrop', value: 0.5 },
    ],
  },
  {
    prefix: 'state',
    label: 'State layers',
    type: 'FLOAT',
    scopes: ['OPACITY'],
    tokens: [
      { name: 'hover', value: 0.08 },
      { name: 'focus', value: 0.12 },
      { name: 'pressed', value: 0.12 },
      { name: 'dragged', value: 0.16 },
    ],
  },
  {
    prefix: 'stroke',
    label: 'Border width',
    type: 'FLOAT',
    scopes: ['STROKE_FLOAT'],
    tokens: [
      { name: 'none', value: 0 },
      { name: 'sm', value: 1 },
      { name: 'md', value: 2 },
      { name: 'lg', value: 4 },
    ],
  },
  {
    prefix: 'z',
    label: 'Z-index',
    type: 'FLOAT',
    scopes: [],
    tokens: [
      { name: 'dropdown', value: 1000 },
      { name: 'sticky', value: 1100 },
      { name: 'overlay', value: 1300 },
      { name: 'modal', value: 1400 },
      { name: 'popover', value: 1500 },
      { name: 'toast', value: 1700 },
      { name: 'tooltip', value: 1800 },
    ],
  },
  {
    prefix: 'focus',
    label: 'Focus ring',
    type: 'FLOAT',
    scopes: [],
    tokens: [
      { name: 'width', value: 2 },
      { name: 'offset', value: 2 },
    ],
  },
  {
    prefix: 'icon',
    label: 'Icon size',
    type: 'FLOAT',
    scopes: ['WIDTH_HEIGHT'],
    tokens: [
      { name: 'xs', value: 12 },
      { name: 'sm', value: 16 },
      { name: 'md', value: 20 },
      { name: 'lg', value: 24 },
      { name: 'xl', value: 32 },
      { name: '2xl', value: 40 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Layout & breakpoints
// A responsive foundation: one Number variable per grid property, resolving to a
// different value in each breakpoint mode so it can be bound to Layout Grids.
// ---------------------------------------------------------------------------

export interface LayoutMode {
  /** Mode name and breakpoint label, e.g. "Mobile". */
  name: string;
  /** Breakpoint/Width for this mode. */
  width: number;
  /** Grid/Columns count. */
  columns: number;
  /** Grid/Margin (px). Figma Number variables can't be "auto", so use a value. */
  margin: number;
  /** Grid/Gutter (px). */
  gutter: number;
}

export const DEFAULT_LAYOUT_MODES: LayoutMode[] = [
  { name: 'Mobile', width: 402, columns: 4, margin: 16, gutter: 16 },
  { name: 'Tablet', width: 768, columns: 8, margin: 32, gutter: 24 },
  { name: 'Desktop', width: 1440, columns: 12, margin: 64, gutter: 24 },
];

/** Number variables written to the Layout & Breakpoints collection, one per mode. */
export const LAYOUT_VARIABLES: { name: string; key: keyof Omit<LayoutMode, 'name'> }[] = [
  { name: 'Breakpoint/Width', key: 'width' },
  { name: 'Grid/Columns', key: 'columns' },
  { name: 'Grid/Margin', key: 'margin' },
  { name: 'Grid/Gutter', key: 'gutter' },
];

// ---------------------------------------------------------------------------
// Component library (Phase 2)
// Metadata describing the starter components the sandbox builds as Figma
// component sets, each wired to the variables generated above (fills → semantic
// color tokens, padding/gap → space/*, corner → radius/*, border → stroke/*).
// Kept as pure data so the UI can list/preview them and the builders stay
// data-driven; all Figma node construction lives in code.ts.
// ---------------------------------------------------------------------------

export interface ComponentInfo {
  key: string;
  label: string;
  /** One-line description of what it is and which tokens it binds. */
  desc: string;
}

export const COMPONENT_LIBRARY: ComponentInfo[] = [
  { key: 'button', label: 'Button', desc: '4 variants × 3 sizes · action / space / radius' },
  { key: 'badge', label: 'Badge', desc: '5 color variants · radius/full' },
  { key: 'input', label: 'Input', desc: 'surface + border + stroke width' },
  { key: 'textarea', label: 'Textarea', desc: 'multi-line surface field' },
  { key: 'select', label: 'Select', desc: 'surface + border + chevron' },
  { key: 'card', label: 'Card', desc: 'surface · border · radius/lg · elevation/2' },
  { key: 'checkbox', label: 'Checkbox', desc: 'checked / unchecked' },
  { key: 'radio', label: 'Radio', desc: 'selected / unselected · radius/full' },
  { key: 'switch', label: 'Switch', desc: 'on / off' },
  { key: 'alert', label: 'Alert', desc: '4 variants · subtle bg + accent dot' },
  { key: 'avatar', label: 'Avatar', desc: '3 sizes · circle + initials' },
  { key: 'tooltip', label: 'Tooltip', desc: 'inverse surface + inverse text' },
  { key: 'tag', label: 'Tag', desc: 'chip with close · radius/sm' },
  { key: 'form-field', label: 'Form field', desc: 'label + control + help text' },
];

export const COMPONENT_KEYS = COMPONENT_LIBRARY.map((c) => c.key);

export const BUTTON_VARIANTS = ['primary', 'secondary', 'ghost', 'danger'] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

export interface ButtonSize {
  name: string;
  /** space/* token suffix for horizontal / vertical padding and gap. */
  padX: string;
  padY: string;
  gap: string;
  /** Literal font size fallback when no text style is applied. */
  font: number;
}

export const BUTTON_SIZES: ButtonSize[] = [
  { name: 'sm', padX: '3', padY: '2', gap: '2', font: 12 },
  { name: 'md', padX: '5', padY: '3', gap: '3', font: 14 },
  { name: 'lg', padX: '6', padY: '4', gap: '3', font: 16 },
];

export const BADGE_COLORS = ['neutral', 'primary', 'success', 'warning', 'danger'] as const;
export type BadgeColor = (typeof BADGE_COLORS)[number];

/** The semantic color token a button variant fills with (null = transparent/ghost). */
export function buttonFillToken(variant: ButtonVariant): string | null {
  if (variant === 'primary') return 'action/primary';
  if (variant === 'secondary') return 'action/secondary';
  if (variant === 'danger') return 'danger';
  return null; // ghost
}

/** The semantic color token a button variant's label uses. */
export function buttonTextToken(variant: ButtonVariant): string {
  if (variant === 'primary' || variant === 'danger') return 'text/on-accent';
  if (variant === 'ghost') return 'action/primary';
  return 'text/primary';
}

/** The fill token for a badge color (neutral reads as a quiet muted chip). */
export function badgeFillToken(color: BadgeColor): string {
  return color === 'neutral' ? 'bg/muted' : color === 'primary' ? 'action/primary' : color;
}

export function badgeTextToken(color: BadgeColor): string {
  return color === 'neutral' ? 'text/primary' : 'text/on-accent';
}

export const ALERT_VARIANTS = ['info', 'success', 'warning', 'danger'] as const;
export type AlertVariant = (typeof ALERT_VARIANTS)[number];

/** Accent color token for an alert variant (the dot / left emphasis). */
export function alertAccentToken(variant: AlertVariant): string {
  return variant === 'info' ? 'action/primary' : variant;
}

export interface AvatarSize {
  name: string;
  /** Diameter in px. */
  size: number;
  /** Initials font size. */
  font: number;
}

export const AVATAR_SIZES: AvatarSize[] = [
  { name: 'sm', size: 24, font: 11 },
  { name: 'md', size: 32, font: 13 },
  { name: 'lg', size: 40, font: 16 },
];

// ---------------------------------------------------------------------------
// Text styles -> variables
// Expand a text style's resolved values into the Number / String variables that
// make up its entry in the Typography Variables collection. Pure so the mapping
// (names + types) is unit-testable; the sandbox reads the styles and writes them.
// ---------------------------------------------------------------------------

export interface ExtractedTextStyle {
  /** Text-style name, used verbatim as the variable group, e.g. "Body/Bold". */
  name: string;
  fontFamily: string;
  /** Font style name as the weight label, e.g. "Semi Bold". */
  fontWeight: string;
  fontSize: number;
  /** Line height in px (0 when the style uses AUTO). */
  lineHeight: number;
  /** Letter spacing in px. */
  letterSpacing: number;
  /** Paragraph spacing in px. */
  paragraphSpacing: number;
}

export interface TextStyleVar {
  name: string;
  type: 'FLOAT' | 'STRING';
  value: number | string;
}

/** Six variables per text style: two strings (family, weight) + four numbers. */
export function textStyleVariables(s: ExtractedTextStyle): TextStyleVar[] {
  return [
    { name: `${s.name}/FontFamily`, type: 'STRING', value: s.fontFamily },
    { name: `${s.name}/FontWeight`, type: 'STRING', value: s.fontWeight },
    { name: `${s.name}/FontSize`, type: 'FLOAT', value: s.fontSize },
    { name: `${s.name}/LineHeight`, type: 'FLOAT', value: s.lineHeight },
    { name: `${s.name}/LetterSpacing`, type: 'FLOAT', value: s.letterSpacing },
    { name: `${s.name}/ParagraphSpacing`, type: 'FLOAT', value: s.paragraphSpacing },
  ];
}
