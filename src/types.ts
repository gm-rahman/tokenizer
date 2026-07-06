// Shared message contracts and value types passed between the UI iframe and the
// sandbox (code.ts) over postMessage. This module has NO runtime dependencies so
// it can be imported from both contexts.

export type ColorSpace = 'oklch' | 'hsl' | 'hsb';

/** Semantic role a color family plays when resolving Light/Dark tokens. */
export type ColorRole =
  | 'neutral'
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'none';

export interface ColorFamilyInput {
  /** Family name used as the variable-name prefix, e.g. "slate" -> "slate/500". */
  name: string;
  /** Base color the 11-step ramp is derived from, e.g. "#3b82f6". */
  baseHex: string;
  /** Semantic role driving token resolution; independent of `name`. */
  role: ColorRole;
}

export interface GenerateColorsPayload {
  families: ColorFamilyInput[];
  space: ColorSpace;
  generateSemanticTokens: boolean;
}

/** One editable type style. Resolved values are computed in the UI. */
export interface TypeStyle {
  /** Stable id for React keys and edits (UI-generated). */
  id: string;
  /** Style name, e.g. "Heading 1". Also the text-style name (see resolveStyleName). */
  name: string;
  /** Modular-scale exponent; when set, fontSize tracks the scale. null = pinned. */
  step: number | null;
  fontSize: number;
  /** Line height in pixels. */
  lineHeight: number;
  /** Letter spacing in pixels. */
  letterSpacing: number;
  textCase: 'ORIGINAL' | 'UPPER';
  /** Weights to emit; each becomes its own text style (Name or Name/Weight). */
  weights: number[];
  /** Per-style font family; falls back to the payload default when empty. */
  font?: string;
}

export interface GenerateTypographyPayload {
  /** Default font family; used by any style without its own `font`. */
  fontFamily: string;
  styles: TypeStyle[];
}

// UI iframe -> sandbox.
export type UiMessage =
  | { type: 'generate-colors'; payload: GenerateColorsPayload }
  | { type: 'generate-typography'; payload: GenerateTypographyPayload }
  | { type: 'resize'; width: number; height: number }
  | { type: 'cancel' };

// Sandbox -> UI iframe.
export type PluginMessage =
  | { type: 'fonts'; families: string[] }
  | { type: 'progress'; message: string; current: number; total: number }
  | { type: 'done'; message: string }
  | { type: 'error'; message: string };
