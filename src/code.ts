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
  LAYOUT_VARIABLES,
} from './utils';
import type { ExtractedTextStyle } from './utils';
import type {
  UiMessage,
  PluginMessage,
  GenerateColorsPayload,
  GenerateTypographyPayload,
  GenerateSystemPayload,
  GenerateLayoutPayload,
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

async function generateColors(payload: GenerateColorsPayload): Promise<void> {
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
  post({ type: 'done', message: `Color variables generated${skippedNote}` });
  figma.notify(`✓ Color variables generated${skippedNote}`);
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

async function generateTypography(payload: GenerateTypographyPayload): Promise<void> {
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

  post({ type: 'done', message: `${total} text styles generated` });
  figma.notify(`✓ ${total} text styles generated`);
}

// ---------------------------------------------------------------------------
// Universal design system (spacing / radii / elevation)
// ---------------------------------------------------------------------------

async function generateSystem(payload: GenerateSystemPayload): Promise<void> {
  const { shadowTint, includeEffectStyles } = payload;
  const collection = await findOrCreateCollection('Design System');
  const modeId = collection.modes[0].modeId;
  collection.renameMode(modeId, 'Base');

  const total =
    SPACING_SCALE.length +
    RADIUS_SCALE.length +
    1 + // shadow tint color
    ELEVATION_LEVELS.length * 5 +
    (includeEffectStyles ? ELEVATION_LEVELS.length : 0);
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

  const note = includeEffectStyles ? ' + effect styles' : '';
  post({ type: 'done', message: `Design system variables generated${note}` });
  figma.notify(`✓ Design system variables generated${note}`);
}

// ---------------------------------------------------------------------------
// Layout & breakpoints
// ---------------------------------------------------------------------------

async function generateLayout(payload: GenerateLayoutPayload): Promise<void> {
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
  post({ type: 'done', message: `Layout variables generated (${modeNames})` });
  figma.notify(`✓ Layout & breakpoint variables generated`);
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
