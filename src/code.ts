// Figma sandbox entry point. Has access to the `figma` API but no DOM.
// Bundled to a single IIFE at dist/code.js by vite.config.code.ts.

import {
  generateScale,
  rgbToFigmaRgba,
  resolveSemanticTokens,
  resolveStyleName,
  WEIGHT_TO_STYLE,
  SCALE_STEPS,
} from './utils';
import type {
  UiMessage,
  PluginMessage,
  GenerateColorsPayload,
  GenerateTypographyPayload,
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

// ---------------------------------------------------------------------------
// Collections & variables (find-or-create; never duplicate)
// ---------------------------------------------------------------------------

async function findOrCreateCollection(name: string): Promise<VariableCollection> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const existing = collections.find((c) => c.name === name);
  return existing ?? figma.variables.createVariableCollection(name);
}

async function findOrCreateColorVariable(name: string, collection: VariableCollection): Promise<Variable> {
  for (const id of collection.variableIds) {
    const variable = await figma.variables.getVariableByIdAsync(id);
    if (variable && variable.name === name) return variable;
  }
  return figma.variables.createVariable(name, collection, 'COLOR');
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
// Message dispatch
// ---------------------------------------------------------------------------

figma.ui.onmessage = async (msg: UiMessage) => {
  try {
    if (msg.type === 'generate-colors') {
      await generateColors(msg.payload);
    } else if (msg.type === 'generate-typography') {
      await generateTypography(msg.payload);
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
