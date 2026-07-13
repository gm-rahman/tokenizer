// Figma sandbox entry point. Has access to the `figma` API but no DOM.
// Bundled to a single IIFE at dist/code.js by vite.config.code.ts.

import {
  generateScale,
  rgbToFigmaRgba,
  hexToRgb,
  resolveSemanticTokens,
  resolveStyleName,
  textStyleVariables,
  WEIGHT_TO_STYLE,
  SCALE_STEPS,
  SPACING_SCALE,
  RADIUS_SCALE,
  ELEVATION_LEVELS,
  elevationVarNames,
  SYSTEM_TOKEN_GROUPS,
  LAYOUT_VARIABLES,
  BUTTON_VARIANTS,
  BUTTON_SIZES,
  BADGE_COLORS,
  buttonFillToken,
  buttonTextToken,
  badgeFillToken,
  badgeTextToken,
} from './utils';
import type { ExtractedTextStyle, ButtonVariant, BadgeColor } from './utils';
import type {
  UiMessage,
  PluginMessage,
  GenerateColorsPayload,
  GenerateTypographyPayload,
  GenerateSystemPayload,
  GenerateLayoutPayload,
  GenerateAllPayload,
  GenerateComponentsPayload,
} from './types';

figma.showUI(__html__, { width: 760, height: 640, themeColors: true });

function post(msg: PluginMessage): void {
  figma.ui.postMessage(msg);
}

// Send the list of installed font families to the UI so it can populate the font
// dropdowns (the iframe has no `figma` API of its own).
void (async () => {
  const fonts = await figma.listAvailableFontsAsync();
  const families = [...new Set(fonts.map((f) => f.fontName.family))].sort((a, b) =>
    a.localeCompare(b),
  );
  post({ type: 'fonts', families });
})();

// Post local text-style names so the Convert tab can preview what will be turned
// into variables (the iframe has no `figma` API of its own).
void (async () => {
  const styles = await figma.getLocalTextStylesAsync();
  post({ type: 'text-styles', names: styles.map((s) => s.name) });
})();

// ---------------------------------------------------------------------------
// Collections & variables (find-or-create; never duplicate)
// ---------------------------------------------------------------------------

async function findOrCreateCollection(name: string): Promise<VariableCollection> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const existing = collections.find((c) => c.name === name);
  return existing ?? figma.variables.createVariableCollection(name);
}

async function findOrCreateVariable(
  name: string,
  collection: VariableCollection,
  type: VariableResolvedDataType,
): Promise<Variable> {
  for (const id of collection.variableIds) {
    const variable = await figma.variables.getVariableByIdAsync(id);
    if (variable && variable.name === name) return variable;
  }
  return figma.variables.createVariable(name, collection, type);
}

async function findOrCreateColorVariable(name: string, collection: VariableCollection): Promise<Variable> {
  return findOrCreateVariable(name, collection, 'COLOR');
}

// Map a list of mode names onto their modeIds, reusing/renaming the collection's
// default first mode and adding the rest. Idempotent across re-runs.
function ensureModes(collection: VariableCollection, names: string[]): string[] {
  return names.map((name, i) => {
    const existing = collection.modes.find((m) => m.name === name);
    if (existing) return existing.modeId;
    if (i === 0) {
      const firstId = collection.modes[0].modeId;
      collection.renameMode(firstId, name);
      return firstId;
    }
    return collection.addMode(name);
  });
}

async function findOrCreateEffectStyle(name: string): Promise<EffectStyle> {
  const existing = await figma.getLocalEffectStylesAsync();
  const found = existing.find((s) => s.name === name);
  if (found) return found;
  const style = figma.createEffectStyle();
  style.name = name;
  return style;
}

// ---------------------------------------------------------------------------
// Colors
// (Semantic-token table + role resolution live in utils.ts, pure and tested.)
// ---------------------------------------------------------------------------

async function generateColors(payload: GenerateColorsPayload, silent = false): Promise<void> {
  const { families, space, generateSemanticTokens } = payload;

  // Resolve semantic tokens up front so progress totals and abort checks are known.
  const resolution = generateSemanticTokens
    ? resolveSemanticTokens(families)
    : { plan: [], skipped: [], missingRequired: [] };
  const doSemantic = generateSemanticTokens && resolution.missingRequired.length === 0;

  const primitives = await findOrCreateCollection('Primitives');
  const modeId = primitives.modes[0].modeId;
  const primitiveVars = new Map<string, Variable>();

  const total = families.length * SCALE_STEPS.length + (doSemantic ? resolution.plan.length : 0);
  let current = 0;

  for (const family of families) {
    for (const stepInfo of generateScale(family.baseHex, space)) {
      const name = `${family.name}/${stepInfo.step}`;
      const variable = await findOrCreateColorVariable(name, primitives);
      variable.setValueForMode(modeId, rgbToFigmaRgba(stepInfo.rgb));
      primitiveVars.set(name, variable);
      current += 1;
      post({ type: 'progress', message: `Primitive ${name}`, current, total });
    }
  }

  if (generateSemanticTokens && !doSemantic) {
    const missing = resolution.missingRequired.join(' & ');
    figma.notify(`⚠ Semantic tokens need a ${missing} family — tag one and re-run.`, {
      error: true,
    });
  } else if (doSemantic) {
    await generateTokens(resolution.plan, primitiveVars, () => {
      current += 1;
      post({ type: 'progress', message: 'Semantic token', current, total });
    });
  }

  const skippedNote =
    doSemantic && resolution.skipped.length > 0
      ? ` (skipped ${resolution.skipped.join(', ')} — no family tagged)`
      : '';
  if (!silent) {
    post({ type: 'done', message: `Color variables generated${skippedNote}` });
    figma.notify(`✓ Color variables generated${skippedNote}`);
  }
}

async function generateTokens(
  plan: ReturnType<typeof resolveSemanticTokens>['plan'],
  primitiveVars: Map<string, Variable>,
  onProgress: () => void,
): Promise<void> {
  const tokens = await findOrCreateCollection('Tokens');

  // Ensure the default mode is "Light" and a "Dark" mode exists.
  const lightId = tokens.modes[0].modeId;
  tokens.renameMode(lightId, 'Light');
  const existingDark = tokens.modes.find((m) => m.name === 'Dark');
  const darkId = existingDark ? existingDark.modeId : tokens.addMode('Dark');

  for (const token of plan) {
    const variable = await findOrCreateColorVariable(token.token, tokens);
    const lightVar = primitiveVars.get(`${token.lightFamily}/${token.lightStep}`);
    const darkVar = primitiveVars.get(`${token.darkFamily}/${token.darkStep}`);
    if (lightVar) variable.setValueForMode(lightId, figma.variables.createVariableAlias(lightVar));
    if (darkVar) variable.setValueForMode(darkId, figma.variables.createVariableAlias(darkVar));
    onProgress();
  }
}

// ---------------------------------------------------------------------------
// Typography
// (WEIGHT_TO_STYLE + resolveStyleName live in utils.ts.)
// ---------------------------------------------------------------------------

async function loadFontWithFallback(family: string, style: string): Promise<FontName> {
  const preferred: FontName = { family, style };
  try {
    await figma.loadFontAsync(preferred);
    return preferred;
  } catch {
    const fallback: FontName = { family, style: 'Regular' };
    await figma.loadFontAsync(fallback);
    return fallback;
  }
}

async function generateTypography(payload: GenerateTypographyPayload, silent = false): Promise<void> {
  const { fontFamily, styles } = payload;
  const existing = await figma.getLocalTextStylesAsync();

  const total = styles.reduce((n, s) => n + Math.max(1, s.weights.length), 0);
  let current = 0;

  for (const style of styles) {
    const family = style.font && style.font.trim() ? style.font : fontFamily;
    const weights = style.weights.length > 0 ? style.weights : [400];

    for (const weight of weights) {
      const styleName = resolveStyleName(style.name, weight, weights.length);
      const fontName = await loadFontWithFallback(family, WEIGHT_TO_STYLE[weight] ?? 'Regular');

      let textStyle = existing.find((s) => s.name === styleName);
      if (!textStyle) {
        textStyle = figma.createTextStyle();
        textStyle.name = styleName;
        existing.push(textStyle);
      }
      textStyle.fontName = fontName;
      textStyle.fontSize = style.fontSize;
      textStyle.lineHeight = { value: style.lineHeight, unit: 'PIXELS' };
      textStyle.letterSpacing = { value: style.letterSpacing, unit: 'PIXELS' };
      textStyle.textCase = style.textCase === 'UPPER' ? 'UPPER' : 'ORIGINAL';

      current += 1;
      post({ type: 'progress', message: `Text style ${styleName}`, current, total });
    }
  }

  if (!silent) {
    post({ type: 'done', message: `${total} text styles generated` });
    figma.notify(`✓ ${total} text styles generated`);
  }
}

// ---------------------------------------------------------------------------
// Universal design system (spacing / radii / elevation)
// ---------------------------------------------------------------------------

async function generateSystem(payload: GenerateSystemPayload, silent = false): Promise<void> {
  const { shadowTint, includeEffectStyles } = payload;
  const collection = await findOrCreateCollection('Design System');
  const modeId = collection.modes[0].modeId;
  collection.renameMode(modeId, 'Base');

  const groupTokenCount = SYSTEM_TOKEN_GROUPS.reduce((n, g) => n + g.tokens.length, 0);
  const total =
    SPACING_SCALE.length +
    RADIUS_SCALE.length +
    1 + // shadow tint color
    ELEVATION_LEVELS.length * 5 +
    (includeEffectStyles ? ELEVATION_LEVELS.length : 0) +
    groupTokenCount;
  let current = 0;
  const tick = (message: string) => post({ type: 'progress', message, current: (current += 1), total });

  for (const s of SPACING_SCALE) {
    const v = await findOrCreateVariable(`space/${s.name}`, collection, 'FLOAT');
    v.setValueForMode(modeId, s.value);
    v.scopes = ['WIDTH_HEIGHT', 'GAP'];
    tick(`space/${s.name}`);
  }

  for (const r of RADIUS_SCALE) {
    const v = await findOrCreateVariable(`radius/${r.name}`, collection, 'FLOAT');
    v.setValueForMode(modeId, r.value);
    v.scopes = ['CORNER_RADIUS'];
    tick(`radius/${r.name}`);
  }

  const tintRgb = hexToRgb(shadowTint);
  const tintVar = await findOrCreateColorVariable('elevation/shadow-tint', collection);
  tintVar.setValueForMode(modeId, rgbToFigmaRgba(tintRgb));
  tick('elevation/shadow-tint');

  for (const level of ELEVATION_LEVELS) {
    for (const { prop, name } of elevationVarNames(level.level)) {
      const v = await findOrCreateVariable(name, collection, 'FLOAT');
      v.setValueForMode(modeId, level[prop]);
    }
    tick(`elevation/${level.level}`);
  }

  if (includeEffectStyles) {
    for (const level of ELEVATION_LEVELS) {
      const style = await findOrCreateEffectStyle(`elevation/${level.level}`);
      const shadow: DropShadowEffect = {
        type: 'DROP_SHADOW',
        color: { r: tintRgb.r / 255, g: tintRgb.g / 255, b: tintRgb.b / 255, a: level.opacity / 100 },
        offset: { x: level.x, y: level.y },
        radius: level.blur,
        spread: level.spread,
        visible: true,
        blendMode: 'NORMAL',
      };
      style.effects = [shadow];
      tick(`Effect elevation/${level.level}`);
    }
  }

  // Extended token layers: motion, opacity, state layers, border widths, z-index,
  // focus ring, icon sizes. Each group is a flat list of same-typed variables.
  for (const group of SYSTEM_TOKEN_GROUPS) {
    for (const t of group.tokens) {
      const name = `${group.prefix}/${t.name}`;
      const v = await findOrCreateVariable(name, collection, group.type);
      v.setValueForMode(modeId, t.value);
      if (group.scopes.length > 0) v.scopes = group.scopes as VariableScope[];
      tick(name);
    }
  }

  const note = includeEffectStyles ? ' + effect styles' : '';
  if (!silent) {
    post({ type: 'done', message: `Design system variables generated${note}` });
    figma.notify(`✓ Design system variables generated${note}`);
  }
}

// ---------------------------------------------------------------------------
// Layout & breakpoints
// ---------------------------------------------------------------------------

async function generateLayout(payload: GenerateLayoutPayload, silent = false): Promise<void> {
  const { modes } = payload;
  const collection = await findOrCreateCollection('Layout & Breakpoints');
  const modeIds = ensureModes(collection, modes.map((m) => m.name));

  const total = LAYOUT_VARIABLES.length;
  let current = 0;

  for (const spec of LAYOUT_VARIABLES) {
    const v = await findOrCreateVariable(spec.name, collection, 'FLOAT');
    modes.forEach((mode, i) => v.setValueForMode(modeIds[i], mode[spec.key]));
    post({ type: 'progress', message: spec.name, current: (current += 1), total });
  }

  const modeNames = modes.map((m) => m.name).join(' / ');
  if (!silent) {
    post({ type: 'done', message: `Layout variables generated (${modeNames})` });
    figma.notify(`✓ Layout & breakpoint variables generated`);
  }
}

// ---------------------------------------------------------------------------
// Text styles -> variables
// ---------------------------------------------------------------------------

function lineHeightPx(lh: LineHeight): number {
  return lh.unit === 'AUTO' ? 0 : Math.round(lh.value * 100) / 100;
}

function letterSpacingPx(ls: LetterSpacing): number {
  // PERCENT is relative to font size; store PIXELS as-is, leave % as its value.
  return Math.round(ls.value * 100) / 100;
}

function extractTextStyle(style: TextStyle): ExtractedTextStyle {
  return {
    name: style.name,
    fontFamily: style.fontName.family,
    fontWeight: style.fontName.style,
    fontSize: style.fontSize,
    lineHeight: lineHeightPx(style.lineHeight),
    letterSpacing: letterSpacingPx(style.letterSpacing),
    paragraphSpacing: style.paragraphSpacing,
  };
}

async function generateTextVariables(): Promise<void> {
  const styles = await figma.getLocalTextStylesAsync();
  if (styles.length === 0) {
    post({ type: 'error', message: 'No local text styles found — generate typography first.' });
    figma.notify('⚠ No local text styles to convert.', { error: true });
    return;
  }

  const collection = await findOrCreateCollection('Typography Variables');
  const modeId = collection.modes[0].modeId;

  const total = styles.length;
  let current = 0;

  for (const style of styles) {
    for (const spec of textStyleVariables(extractTextStyle(style))) {
      const v = await findOrCreateVariable(spec.name, collection, spec.type);
      v.setValueForMode(modeId, spec.value);
    }
    post({ type: 'progress', message: style.name, current: (current += 1), total });
  }

  post({ type: 'done', message: `${styles.length} text styles → variables` });
  figma.notify(`✓ ${styles.length} text styles converted to variables`);
}

// ---------------------------------------------------------------------------
// One-click: generate the entire system, then draw the documentation page
// ---------------------------------------------------------------------------

async function generateAll(payload: GenerateAllPayload): Promise<void> {
  await generateColors(payload.colors, true);
  await generateTypography(payload.typography, true);
  await generateSystem(payload.system, true);
  await generateLayout(payload.layout, true);
  if (payload.includeDocsPage) {
    post({ type: 'progress', message: 'Documentation page', current: 1, total: 1 });
    await generateDocsPage(payload);
  }
  post({ type: 'done', message: 'Entire design system generated' });
  figma.notify('✓ Entire design system generated');
}

// ---------------------------------------------------------------------------
// On-canvas documentation page
// Drawn from the in-memory payload (not read back from variables) so there is no
// alias resolution to do. Find-or-updates a "Design System" page and replaces its
// own reference frame on re-run, so it never duplicates.
// ---------------------------------------------------------------------------

const DOC_FRAME_NAME = 'Design System Reference';
const INK: RGB01 = { r: 0.1, g: 0.11, b: 0.16 };
const MUTED: RGB01 = { r: 0.42, g: 0.45, b: 0.52 };

interface RGB01 {
  r: number;
  g: number;
  b: number;
}

function rgb01(hex: string): RGB01 {
  const { r, g, b } = hexToRgb(hex);
  return { r: r / 255, g: g / 255, b: b / 255 };
}

async function loadDocFonts(): Promise<{ regular: FontName; bold: FontName }> {
  for (const family of ['Inter', 'Roboto', 'Arial', 'Helvetica Neue']) {
    try {
      const regular: FontName = { family, style: 'Regular' };
      await figma.loadFontAsync(regular);
      let bold: FontName = regular;
      try {
        const b: FontName = { family, style: 'Bold' };
        await figma.loadFontAsync(b);
        bold = b;
      } catch {
        /* keep regular for bold */
      }
      return { regular, bold };
    } catch {
      /* try next family */
    }
  }
  const all = await figma.listAvailableFontsAsync();
  const f = all[0].fontName;
  await figma.loadFontAsync(f);
  return { regular: f, bold: f };
}

async function generateDocsPage(payload: GenerateAllPayload): Promise<void> {
  const { regular, bold } = await loadDocFonts();

  const text = (chars: string, font: FontName, size: number, color: RGB01 = INK): TextNode => {
    const t = figma.createText();
    t.fontName = font;
    t.characters = chars;
    t.fontSize = size;
    t.fills = [{ type: 'SOLID', color }];
    return t;
  };
  const swatch = (w: number, h: number, color: RGB01, corner = 4): RectangleNode => {
    const r = figma.createRectangle();
    r.resize(w, h);
    r.fills = [{ type: 'SOLID', color }];
    r.cornerRadius = corner;
    return r;
  };
  const stack = (
    dir: 'VERTICAL' | 'HORIZONTAL',
    gap: number,
    children: SceneNode[],
    align: 'MIN' | 'CENTER' = 'MIN',
  ): FrameNode => {
    const f = figma.createFrame();
    f.layoutMode = dir;
    f.itemSpacing = gap;
    f.primaryAxisSizingMode = 'AUTO';
    f.counterAxisSizingMode = 'AUTO';
    f.counterAxisAlignItems = align;
    f.fills = [];
    for (const c of children) f.appendChild(c);
    return f;
  };
  const section = (title: string, body: SceneNode): FrameNode =>
    stack('VERTICAL', 14, [text(title, bold, 18), body]);

  // --- Colors: family ramps ---
  const colorRows = payload.colors.families.map((fam) => {
    const steps = generateScale(fam.baseHex, payload.colors.space);
    const ramp = stack('HORIZONTAL', 2, steps.map((s) => swatch(30, 44, rgb01(s.hex))));
    const label = text(`${fam.name}${fam.role !== 'none' ? `  ·  ${fam.role}` : ''}`, regular, 12, MUTED);
    return stack('VERTICAL', 6, [label, ramp]);
  });

  // --- Semantic tokens: Light/Dark pairs ---
  const resolution = resolveSemanticTokens(payload.colors.families);
  const hexAt = (family: string, step: number): string =>
    generateScale(payload.colors.families.find((f) => f.name === family)!.baseHex, payload.colors.space).find(
      (s) => s.step === step,
    )?.hex ?? '#888888';
  const tokenRows = resolution.plan.map((t) => {
    const pair = stack('HORIZONTAL', 0, [
      swatch(22, 26, rgb01(hexAt(t.lightFamily, t.lightStep)), 0),
      swatch(22, 26, rgb01(hexAt(t.darkFamily, t.darkStep)), 0),
    ]);
    return stack('HORIZONTAL', 10, [pair, text(t.token, regular, 12)], 'CENTER');
  });

  // --- Type specimens ---
  const typeRows = payload.typography.styles.map((s) => {
    const size = Math.min(s.fontSize, 72);
    const line = text(s.name, bold, size);
    const meta = text(`${s.fontSize}px · ${s.font || payload.typography.fontFamily}`, regular, 11, MUTED);
    return stack('VERTICAL', 4, [line, meta]);
  });

  // --- Extended token layers ---
  const layerRows = SYSTEM_TOKEN_GROUPS.map((g) => {
    const rows = g.tokens.map((tk) =>
      stack('HORIZONTAL', 8, [text(`${g.prefix}/${tk.name}`, regular, 12), text(String(tk.value), regular, 12, MUTED)]),
    );
    return stack('VERTICAL', 8, [text(g.label, bold, 13), stack('VERTICAL', 4, rows)]);
  });

  const root = figma.createFrame();
  root.name = DOC_FRAME_NAME;
  root.layoutMode = 'VERTICAL';
  root.itemSpacing = 40;
  root.paddingTop = root.paddingBottom = root.paddingLeft = root.paddingRight = 48;
  root.primaryAxisSizingMode = 'AUTO';
  root.counterAxisSizingMode = 'AUTO';
  root.fills = [{ type: 'SOLID', color: rgb01('#ffffff') }];
  root.cornerRadius = 16;

  root.appendChild(text('Design System', bold, 34));
  root.appendChild(section('Colors', stack('VERTICAL', 16, colorRows)));
  if (tokenRows.length) root.appendChild(section('Semantic tokens · Light / Dark', stack('VERTICAL', 8, tokenRows)));
  root.appendChild(section('Typography', stack('VERTICAL', 16, typeRows)));
  root.appendChild(section('Foundations', stack('HORIZONTAL', 40, layerRows)));

  // Find-or-create the page, drop the previous reference frame, and add the new one.
  await figma.loadAllPagesAsync();
  let page = figma.root.children.find((p) => p.name === 'Design System');
  if (!page) {
    page = figma.createPage();
    page.name = 'Design System';
  }
  for (const child of page.children) {
    if (child.name === DOC_FRAME_NAME) child.remove();
  }
  page.appendChild(root);
  await figma.setCurrentPageAsync(page);
  figma.viewport.scrollAndZoomIntoView([root]);
}

// ---------------------------------------------------------------------------
// Component library (Phase 2)
// Builds starter Figma components wired to the generated variables. Each token
// bind falls back to a literal value when the variable is absent, so components
// still build if tokens haven't been generated yet. All node construction is
// defensive and per-component, so one failure never aborts the whole pass.
// ---------------------------------------------------------------------------

const COMP_BOARD_NAME = 'Component Library';

// Literal colors used only when the matching semantic variable does not exist.
const FALLBACK_HEX: Record<string, string> = {
  'action/primary': '#2563eb',
  'action/secondary': '#e2e8f0',
  danger: '#dc2626',
  success: '#16a34a',
  warning: '#f59e0b',
  'text/on-accent': '#ffffff',
  'text/primary': '#0f172a',
  'text/secondary': '#475569',
  'bg/surface': '#ffffff',
  'bg/muted': '#e2e8f0',
  'border/default': '#cbd5e1',
  'border/strong': '#94a3b8',
};
const fallbackHex = (name: string): string => FALLBACK_HEX[name] ?? '#888888';

const SPACE_PX: Record<string, number> = Object.fromEntries(SPACING_SCALE.map((s) => [s.name, s.value]));
const spacePx = (name: string): number => SPACE_PX[name] ?? 8;

type AutoLayoutNode = ComponentNode | FrameNode;

async function buildVarIndex(): Promise<Map<string, Variable>> {
  const index = new Map<string, Variable>();
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  for (const collection of collections) {
    for (const id of collection.variableIds) {
      const v = await figma.variables.getVariableByIdAsync(id);
      if (v) index.set(v.name, v);
    }
  }
  return index;
}

function fillPaint(index: Map<string, Variable>, token: string): Paint {
  const base: SolidPaint = { type: 'SOLID', color: rgb01(fallbackHex(token)) };
  const v = index.get(token);
  return v ? figma.variables.setBoundVariableForPaint(base, 'color', v) : base;
}

function pad(node: AutoLayoutNode, index: Map<string, Variable>, xTok: string, yTok: string): void {
  const vx = index.get(`space/${xTok}`);
  const vy = index.get(`space/${yTok}`);
  if (vx) {
    node.setBoundVariable('paddingLeft', vx);
    node.setBoundVariable('paddingRight', vx);
  } else {
    node.paddingLeft = node.paddingRight = spacePx(xTok);
  }
  if (vy) {
    node.setBoundVariable('paddingTop', vy);
    node.setBoundVariable('paddingBottom', vy);
  } else {
    node.paddingTop = node.paddingBottom = spacePx(yTok);
  }
}

function gap(node: AutoLayoutNode, index: Map<string, Variable>, tok: string): void {
  const v = index.get(`space/${tok}`);
  if (v) node.setBoundVariable('itemSpacing', v);
  else node.itemSpacing = spacePx(tok);
}

const CORNER_FIELDS = ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'] as const;

function radius(node: AutoLayoutNode, index: Map<string, Variable>, name: string, fallback: number): void {
  const v = index.get(`radius/${name}`);
  if (v) for (const f of CORNER_FIELDS) node.setBoundVariable(f, v);
  else node.cornerRadius = fallback;
}

function strokeWidth(node: AutoLayoutNode, index: Map<string, Variable>, name: string, fallback: number): void {
  const v = index.get(`stroke/${name}`);
  if (v) node.setBoundVariable('strokeWeight', v);
  else node.strokeWeight = fallback;
}

async function makeTextNode(
  chars: string,
  styleName: string,
  styles: TextStyle[],
  fallbackFont: FontName,
  fallbackSize: number,
  fill: Paint,
): Promise<TextNode> {
  const t = figma.createText();
  const style = styleName ? styles.find((s) => s.name === styleName) : undefined;
  let font = fallbackFont;
  if (style) {
    try {
      await figma.loadFontAsync(style.fontName);
      font = style.fontName;
    } catch {
      /* keep fallback */
    }
  }
  t.fontName = font;
  t.characters = chars;
  if (style) {
    try {
      await t.setTextStyleIdAsync(style.id);
    } catch {
      /* leave literal size */
    }
  } else {
    t.fontSize = fallbackSize;
  }
  t.fills = [fill];
  return t;
}

async function buildButton(
  index: Map<string, Variable>,
  styles: TextStyle[],
  font: FontName,
): Promise<ComponentSetNode> {
  const nodes: ComponentNode[] = [];
  for (const variant of BUTTON_VARIANTS) {
    for (const size of BUTTON_SIZES) {
      const c = figma.createComponent();
      c.name = `Variant=${variant}, Size=${size.name}`;
      c.layoutMode = 'HORIZONTAL';
      c.primaryAxisSizingMode = 'AUTO';
      c.counterAxisSizingMode = 'AUTO';
      c.primaryAxisAlignItems = 'CENTER';
      c.counterAxisAlignItems = 'CENTER';
      pad(c, index, size.padX, size.padY);
      gap(c, index, size.gap);
      radius(c, index, 'md', 8);
      const fillToken = buttonFillToken(variant as ButtonVariant);
      c.fills = fillToken ? [fillPaint(index, fillToken)] : [];
      const label = await makeTextNode('Button', 'Body', styles, font, size.font, fillPaint(index, buttonTextToken(variant as ButtonVariant)));
      c.appendChild(label);
      nodes.push(c);
    }
  }
  const set = figma.combineAsVariants(nodes, figma.currentPage);
  set.name = 'Button';
  return set;
}

async function buildBadge(
  index: Map<string, Variable>,
  styles: TextStyle[],
  font: FontName,
): Promise<ComponentSetNode> {
  const nodes: ComponentNode[] = [];
  for (const color of BADGE_COLORS) {
    const c = figma.createComponent();
    c.name = `Color=${color}`;
    c.layoutMode = 'HORIZONTAL';
    c.primaryAxisSizingMode = 'AUTO';
    c.counterAxisSizingMode = 'AUTO';
    c.primaryAxisAlignItems = 'CENTER';
    c.counterAxisAlignItems = 'CENTER';
    pad(c, index, '3', '1');
    radius(c, index, 'full', 9999);
    c.fills = [fillPaint(index, badgeFillToken(color as BadgeColor))];
    const label = await makeTextNode('Badge', 'Label', styles, font, 11, fillPaint(index, badgeTextToken(color as BadgeColor)));
    c.appendChild(label);
    nodes.push(c);
  }
  const set = figma.combineAsVariants(nodes, figma.currentPage);
  set.name = 'Badge';
  return set;
}

async function buildInput(
  index: Map<string, Variable>,
  styles: TextStyle[],
  font: FontName,
): Promise<ComponentNode> {
  const c = figma.createComponent();
  c.name = 'Input';
  c.layoutMode = 'HORIZONTAL';
  c.counterAxisSizingMode = 'AUTO';
  c.counterAxisAlignItems = 'CENTER';
  pad(c, index, '4', '3');
  radius(c, index, 'md', 8);
  c.fills = [fillPaint(index, 'bg/surface')];
  c.strokes = [fillPaint(index, 'border/default')];
  c.strokeAlign = 'INSIDE';
  strokeWidth(c, index, 'sm', 1);
  const placeholder = await makeTextNode('Placeholder', 'Body', styles, font, 14, fillPaint(index, 'text/secondary'));
  c.appendChild(placeholder);
  c.primaryAxisSizingMode = 'FIXED';
  c.resize(240, Math.max(1, c.height));
  return c;
}

async function buildCard(
  index: Map<string, Variable>,
  styles: TextStyle[],
  font: FontName,
): Promise<ComponentNode> {
  const c = figma.createComponent();
  c.name = 'Card';
  c.layoutMode = 'VERTICAL';
  c.counterAxisSizingMode = 'FIXED';
  gap(c, index, '3');
  pad(c, index, '6', '6');
  radius(c, index, 'lg', 12);
  c.fills = [fillPaint(index, 'bg/surface')];
  c.strokes = [fillPaint(index, 'border/default')];
  c.strokeAlign = 'INSIDE';
  strokeWidth(c, index, 'sm', 1);
  const effectStyles = await figma.getLocalEffectStylesAsync();
  const elevation = effectStyles.find((s) => s.name === 'elevation/2');
  if (elevation) await c.setEffectStyleIdAsync(elevation.id);
  const title = await makeTextNode('Card title', 'Heading 4', styles, font, 18, fillPaint(index, 'text/primary'));
  const body = await makeTextNode(
    'Supporting copy that describes the card contents in a sentence or two.',
    'Body',
    styles,
    font,
    14,
    fillPaint(index, 'text/secondary'),
  );
  c.appendChild(title);
  c.appendChild(body);
  c.resize(280, Math.max(1, c.height));
  // layoutSizing can only be set once the node is a child of the auto-layout frame.
  body.layoutSizingHorizontal = 'FILL';
  return c;
}

async function buildCheckbox(index: Map<string, Variable>, font: FontName): Promise<ComponentSetNode> {
  const nodes: ComponentNode[] = [];
  for (const checked of [false, true]) {
    const c = figma.createComponent();
    c.name = `Checked=${checked}`;
    c.layoutMode = 'HORIZONTAL';
    c.primaryAxisSizingMode = 'FIXED';
    c.counterAxisSizingMode = 'FIXED';
    c.primaryAxisAlignItems = 'CENTER';
    c.counterAxisAlignItems = 'CENTER';
    c.resize(20, 20);
    radius(c, index, 'sm', 6);
    c.fills = [fillPaint(index, checked ? 'action/primary' : 'bg/surface')];
    c.strokes = [fillPaint(index, 'border/strong')];
    c.strokeAlign = 'INSIDE';
    strokeWidth(c, index, 'sm', 1);
    if (checked) {
      const tick = await makeTextNode('✓', '', [], font, 13, fillPaint(index, 'text/on-accent'));
      c.appendChild(tick);
    }
    nodes.push(c);
  }
  const set = figma.combineAsVariants(nodes, figma.currentPage);
  set.name = 'Checkbox';
  return set;
}

async function buildSwitch(index: Map<string, Variable>): Promise<ComponentSetNode> {
  const nodes: ComponentNode[] = [];
  for (const on of [false, true]) {
    const c = figma.createComponent();
    c.name = `On=${on}`;
    c.layoutMode = 'HORIZONTAL';
    c.primaryAxisSizingMode = 'FIXED';
    c.counterAxisSizingMode = 'FIXED';
    c.primaryAxisAlignItems = on ? 'MAX' : 'MIN';
    c.counterAxisAlignItems = 'CENTER';
    c.resize(36, 20);
    c.paddingLeft = c.paddingRight = c.paddingTop = c.paddingBottom = 2;
    radius(c, index, 'full', 9999);
    c.fills = [fillPaint(index, on ? 'action/primary' : 'bg/muted')];
    const knob = figma.createEllipse();
    knob.resize(16, 16);
    knob.fills = [{ type: 'SOLID', color: rgb01('#ffffff') }];
    c.appendChild(knob);
    nodes.push(c);
  }
  const set = figma.combineAsVariants(nodes, figma.currentPage);
  set.name = 'Switch';
  return set;
}

async function generateComponents(payload: GenerateComponentsPayload): Promise<void> {
  const index = await buildVarIndex();
  const styles = await figma.getLocalTextStylesAsync();
  const { regular } = await loadDocFonts();

  const builders: Record<string, () => Promise<SceneNode>> = {
    button: () => buildButton(index, styles, regular),
    badge: () => buildBadge(index, styles, regular),
    input: () => buildInput(index, styles, regular),
    card: () => buildCard(index, styles, regular),
    checkbox: () => buildCheckbox(index, regular),
    switch: () => buildSwitch(index),
  };

  const built: { label: string; node: SceneNode }[] = [];
  const failed: string[] = [];
  const total = payload.components.length;
  let current = 0;
  for (const key of payload.components) {
    const build = builders[key];
    if (!build) continue;
    try {
      built.push({ label: key, node: await build() });
    } catch {
      failed.push(key);
    }
    post({ type: 'progress', message: `Component ${key}`, current: (current += 1), total });
  }

  // Place everything on a "Components" page in a labelled board; replace on re-run.
  await figma.loadAllPagesAsync();
  let page = figma.root.children.find((p) => p.name === 'Components');
  if (!page) {
    page = figma.createPage();
    page.name = 'Components';
  }
  for (const child of page.children) {
    if (child.name === COMP_BOARD_NAME) child.remove();
  }

  const board = figma.createFrame();
  board.name = COMP_BOARD_NAME;
  board.layoutMode = 'VERTICAL';
  board.itemSpacing = 48;
  board.paddingTop = board.paddingBottom = board.paddingLeft = board.paddingRight = 64;
  board.primaryAxisSizingMode = 'AUTO';
  board.counterAxisSizingMode = 'AUTO';
  board.fills = [{ type: 'SOLID', color: rgb01('#f8fafc') }];

  board.appendChild(await makeTextNode('Components', '', styles, regular, 32, { type: 'SOLID', color: INK }));
  for (const { label, node } of built) {
    const group = figma.createFrame();
    group.name = label;
    group.layoutMode = 'VERTICAL';
    group.itemSpacing = 12;
    group.primaryAxisSizingMode = 'AUTO';
    group.counterAxisSizingMode = 'AUTO';
    group.fills = [];
    group.appendChild(await makeTextNode(label, '', styles, regular, 14, { type: 'SOLID', color: MUTED }));
    group.appendChild(node);
    board.appendChild(group);
  }
  page.appendChild(board);
  await figma.setCurrentPageAsync(page);
  figma.viewport.scrollAndZoomIntoView([board]);

  const note = failed.length ? ` (failed: ${failed.join(', ')})` : '';
  post({ type: 'done', message: `${built.length} components generated${note}` });
  figma.notify(`✓ ${built.length} components generated${note}`);
}

// ---------------------------------------------------------------------------
// Message dispatch
// ---------------------------------------------------------------------------

figma.ui.onmessage = async (msg: UiMessage) => {
  try {
    if (msg.type === 'generate-colors') {
      await generateColors(msg.payload);
    } else if (msg.type === 'generate-typography') {
      await generateTypography(msg.payload);
    } else if (msg.type === 'generate-system') {
      await generateSystem(msg.payload);
    } else if (msg.type === 'generate-layout') {
      await generateLayout(msg.payload);
    } else if (msg.type === 'generate-all') {
      await generateAll(msg.payload);
    } else if (msg.type === 'generate-components') {
      await generateComponents(msg.payload);
    } else if (msg.type === 'generate-text-variables') {
      await generateTextVariables();
    } else if (msg.type === 'resize') {
      figma.ui.resize(Math.max(320, msg.width), Math.max(400, msg.height));
    } else if (msg.type === 'cancel') {
      figma.closePlugin();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    post({ type: 'error', message });
    figma.notify(`⚠ ${message}`, { error: true });
  }
};
