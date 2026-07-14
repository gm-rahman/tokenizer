import { describe, test, expect } from 'vitest';
import {
  defaultTypeStyles,
  resolveStyleName,
  resolveSemanticTokens,
  textStyleVariables,
  elevationVarNames,
  SPACING_SCALE,
  RADIUS_SCALE,
  ELEVATION_LEVELS,
  SYSTEM_TOKEN_GROUPS,
  DEFAULT_LAYOUT_MODES,
  COMPONENT_LIBRARY,
  COMPONENT_KEYS,
  buttonFillToken,
  buttonTextToken,
  badgeFillToken,
  badgeTextToken,
  alertAccentToken,
  buildDtcgTokens,
} from './utils';
import type { ExtractedTextStyle } from './utils';
import type { ColorFamilyInput } from './types';

describe('defaultTypeStyles', () => {
  const styles = defaultTypeStyles(16, 1.25, 1);

  test('produces the 8 default levels in order', () => {
    expect(styles.map((s) => s.name)).toEqual([
      'Display',
      'Heading 1',
      'Heading 2',
      'Heading 3',
      'Heading 4',
      'Body',
      'Caption',
      'Label',
    ]);
  });

  test('sizes follow base * ratio^step * multiplier', () => {
    const body = styles.find((s) => s.name === 'Body')!;
    const display = styles.find((s) => s.name === 'Display')!;
    expect(body.fontSize).toBe(16); // step 0
    expect(display.fontSize).toBe(Math.round(16 * Math.pow(1.25, 6))); // step 6 -> 61
  });

  test('multiplier scales every size', () => {
    const big = defaultTypeStyles(16, 1.25, 2);
    expect(big.find((s) => s.name === 'Body')!.fontSize).toBe(32);
  });

  test('every default style tracks the scale (numeric step)', () => {
    expect(styles.every((s) => typeof s.step === 'number')).toBe(true);
  });

  test('Body ships with regular + semibold weights', () => {
    expect(styles.find((s) => s.name === 'Body')!.weights).toEqual([400, 600]);
  });

  test('Label is uppercase and single-weight', () => {
    const label = styles.find((s) => s.name === 'Label')!;
    expect(label.textCase).toBe('UPPER');
    expect(label.weights).toEqual([600]);
  });
});

describe('resolveStyleName', () => {
  test('single weight uses the bare name', () => {
    expect(resolveStyleName('Body', 400, 1)).toBe('Body');
  });

  test('multiple weights append the style name', () => {
    expect(resolveStyleName('Body', 700, 2)).toBe('Body/Bold');
    expect(resolveStyleName('Heading 1', 600, 3)).toBe('Heading 1/Semi Bold');
  });
});

describe('resolveSemanticTokens', () => {
  const full: ColorFamilyInput[] = [
    { name: 'slate', baseHex: '#64748b', role: 'neutral' },
    { name: 'blue', baseHex: '#3b82f6', role: 'primary' },
    { name: 'violet', baseHex: '#8b5cf6', role: 'secondary' },
    { name: 'green', baseHex: '#16a34a', role: 'success' },
    { name: 'amber', baseHex: '#f59e0b', role: 'warning' },
    { name: 'red', baseHex: '#dc2626', role: 'danger' },
  ];

  test('full family set resolves every token with no skips', () => {
    const { plan, skipped, missingRequired } = resolveSemanticTokens(full);
    expect(plan).toHaveLength(19);
    expect(skipped).toEqual([]);
    expect(missingRequired).toEqual([]);
  });

  test('each token aliases the same family in both modes', () => {
    const { plan } = resolveSemanticTokens(full);
    const primary = plan.find((p) => p.token === 'action/primary')!;
    expect(primary.lightFamily).toBe('blue');
    expect(primary.darkFamily).toBe('blue');
    expect(primary.lightStep).toBe(600);
    expect(primary.darkStep).toBe(500);
  });

  test('action/secondary uses the secondary family when tagged', () => {
    const { plan } = resolveSemanticTokens(full);
    expect(plan.find((p) => p.token === 'action/secondary')!.lightFamily).toBe('violet');
  });

  test('action/secondary falls back to neutral when no secondary family', () => {
    const noSecondary = full.filter((f) => f.role !== 'secondary');
    const { plan, skipped } = resolveSemanticTokens(noSecondary);
    expect(plan.find((p) => p.token === 'action/secondary')!.lightFamily).toBe('slate');
    expect(skipped).not.toContain('secondary');
  });

  test('dropping the success family skips only its token', () => {
    const noSuccess = full.filter((f) => f.role !== 'success');
    const { plan, skipped } = resolveSemanticTokens(noSuccess);
    expect(plan.find((p) => p.token === 'success')).toBeUndefined();
    expect(skipped).toEqual(['success']);
    expect(plan).toHaveLength(18);
  });

  test('missing neutral or primary is reported as required', () => {
    const noNeutral = full.filter((f) => f.role !== 'neutral');
    expect(resolveSemanticTokens(noNeutral).missingRequired).toContain('neutral');
    const noPrimary = full.filter((f) => f.role !== 'primary');
    expect(resolveSemanticTokens(noPrimary).missingRequired).toContain('primary');
  });

  test('first family wins when a role is duplicated', () => {
    const dupes: ColorFamilyInput[] = [
      { name: 'zinc', baseHex: '#71717a', role: 'neutral' },
      { name: 'slate', baseHex: '#64748b', role: 'neutral' },
      { name: 'blue', baseHex: '#3b82f6', role: 'primary' },
    ];
    const { plan } = resolveSemanticTokens(dupes);
    expect(plan.find((p) => p.token === 'text/primary')!.lightFamily).toBe('zinc');
  });
});

describe('textStyleVariables', () => {
  const style: ExtractedTextStyle = {
    name: 'Heading 1',
    fontFamily: 'Inter',
    fontWeight: 'Bold',
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: -0.2,
    paragraphSpacing: 8,
  };

  test('emits six variables prefixed with the style name', () => {
    const vars = textStyleVariables(style);
    expect(vars.map((v) => v.name)).toEqual([
      'Heading 1/FontFamily',
      'Heading 1/FontWeight',
      'Heading 1/FontSize',
      'Heading 1/LineHeight',
      'Heading 1/LetterSpacing',
      'Heading 1/ParagraphSpacing',
    ]);
  });

  test('strings for family/weight, floats for the numeric props', () => {
    const vars = textStyleVariables(style);
    const byName = (n: string) => vars.find((v) => v.name === `Heading 1/${n}`)!;
    expect(byName('FontFamily')).toMatchObject({ type: 'STRING', value: 'Inter' });
    expect(byName('FontWeight')).toMatchObject({ type: 'STRING', value: 'Bold' });
    expect(byName('FontSize')).toMatchObject({ type: 'FLOAT', value: 24 });
    expect(byName('LetterSpacing')).toMatchObject({ type: 'FLOAT', value: -0.2 });
  });

  test('nested style names stay nested (Body/Bold -> Body/Bold/FontSize)', () => {
    const vars = textStyleVariables({ ...style, name: 'Body/Bold' });
    expect(vars.some((v) => v.name === 'Body/Bold/FontSize')).toBe(true);
  });
});

describe('universal system data', () => {
  test('spacing is ascending and starts at 0', () => {
    expect(SPACING_SCALE[0].value).toBe(0);
    const values = SPACING_SCALE.map((s) => s.value);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });

  test('radius scale runs from none to a pill value', () => {
    expect(RADIUS_SCALE[0]).toMatchObject({ name: 'none', value: 0 });
    expect(RADIUS_SCALE[RADIUS_SCALE.length - 1].name).toBe('full');
  });

  test('elevation opacity climbs with level', () => {
    const ops = ELEVATION_LEVELS.map((e) => e.opacity);
    expect([...ops].sort((a, b) => a - b)).toEqual(ops);
  });

  test('elevationVarNames yields the five components for a level', () => {
    expect(elevationVarNames(2).map((n) => n.name)).toEqual([
      'elevation/2/x',
      'elevation/2/y',
      'elevation/2/blur',
      'elevation/2/spread',
      'elevation/2/opacity',
    ]);
  });
});

describe('extended token layers', () => {
  test('ships the expected token groups', () => {
    expect(SYSTEM_TOKEN_GROUPS.map((g) => g.prefix)).toEqual([
      'duration',
      'easing',
      'opacity',
      'state',
      'stroke',
      'z',
      'focus',
      'icon',
    ]);
  });

  test('every variable name is unique across all groups', () => {
    const names = SYSTEM_TOKEN_GROUPS.flatMap((g) => g.tokens.map((t) => `${g.prefix}/${t.name}`));
    expect(new Set(names).size).toBe(names.length);
  });

  test('easing values are cubic-bezier strings on a STRING group', () => {
    const easing = SYSTEM_TOKEN_GROUPS.find((g) => g.prefix === 'easing')!;
    expect(easing.type).toBe('STRING');
    expect(easing.tokens.every((t) => /^cubic-bezier\(/.test(String(t.value)))).toBe(true);
  });

  test('durations ascend', () => {
    const durations = SYSTEM_TOKEN_GROUPS.find((g) => g.prefix === 'duration')!.tokens.map(
      (t) => t.value as number,
    );
    expect([...durations].sort((a, b) => a - b)).toEqual(durations);
  });

  test('opacity-scoped groups use the OPACITY scope', () => {
    for (const prefix of ['opacity', 'state']) {
      expect(SYSTEM_TOKEN_GROUPS.find((g) => g.prefix === prefix)!.scopes).toContain('OPACITY');
    }
  });
});

describe('component library', () => {
  test('COMPONENT_KEYS mirrors the library, keys unique', () => {
    const keys = COMPONENT_LIBRARY.map((c) => c.key);
    expect(COMPONENT_KEYS).toEqual(keys);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('button fill tokens: ghost is transparent, others map to a semantic token', () => {
    expect(buttonFillToken('primary')).toBe('action/primary');
    expect(buttonFillToken('secondary')).toBe('action/secondary');
    expect(buttonFillToken('danger')).toBe('danger');
    expect(buttonFillToken('ghost')).toBeNull();
  });

  test('button text tokens: accent fills use on-accent, ghost uses the action color', () => {
    expect(buttonTextToken('primary')).toBe('text/on-accent');
    expect(buttonTextToken('danger')).toBe('text/on-accent');
    expect(buttonTextToken('ghost')).toBe('action/primary');
    expect(buttonTextToken('secondary')).toBe('text/primary');
  });

  test('badge tokens: neutral is a muted chip, colors fill with their role', () => {
    expect(badgeFillToken('neutral')).toBe('bg/muted');
    expect(badgeFillToken('primary')).toBe('action/primary');
    expect(badgeFillToken('success')).toBe('success');
    expect(badgeTextToken('neutral')).toBe('text/primary');
    expect(badgeTextToken('danger')).toBe('text/on-accent');
  });

  test('alert accent: info maps to the action color, others to their role', () => {
    expect(alertAccentToken('info')).toBe('action/primary');
    expect(alertAccentToken('success')).toBe('success');
    expect(alertAccentToken('warning')).toBe('warning');
    expect(alertAccentToken('danger')).toBe('danger');
  });
});

describe('buildDtcgTokens', () => {
  const families: ColorFamilyInput[] = [
    { name: 'slate', baseHex: '#64748b', role: 'neutral' },
    { name: 'blue', baseHex: '#3b82f6', role: 'primary' },
  ];
  const styles = defaultTypeStyles(16, 1.25, 1).map((s, i) => ({ ...s, id: `s${i}` }));
  const tokens = buildDtcgTokens({
    families,
    space: 'oklch',
    fontFamily: 'Inter',
    styles,
    shadowTint: '#101828',
    layoutModes: DEFAULT_LAYOUT_MODES,
  });
  const get = (o: unknown, ...keys: string[]): unknown =>
    keys.reduce((cur, k) => (cur as Record<string, unknown>)[k], o);

  test('primitives are a color group with hex ramps', () => {
    expect(get(tokens, 'primitives', '$type')).toBe('color');
    expect(get(tokens, 'primitives', 'slate', '500', '$value')).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test('semantic tokens are aliases into primitives, split by mode', () => {
    expect(get(tokens, 'semantic', 'light', 'bg', 'canvas', '$value')).toMatch(/^\{primitives\..+\.\d+\}$/);
    expect(get(tokens, 'semantic', 'dark', 'text', 'primary', '$value')).toMatch(/^\{primitives\..+\.\d+\}$/);
  });

  test('duration is a DTCG duration and easing is a cubicBezier array', () => {
    expect(get(tokens, 'system', 'duration', '$type')).toBe('duration');
    expect(get(tokens, 'system', 'duration', 'normal', '$value')).toEqual({ value: 200, unit: 'ms' });
    expect(get(tokens, 'system', 'easing', '$type')).toBe('cubicBezier');
    expect(get(tokens, 'system', 'easing', 'standard', '$value')).toEqual([0.2, 0, 0, 1]);
  });

  test('elevation is a shadow composite with an 8-digit color', () => {
    const v = get(tokens, 'system', 'elevation', '1', '$value') as Record<string, unknown>;
    expect(v.offsetY).toEqual({ value: 1, unit: 'px' });
    expect(String(v.color)).toMatch(/^#[0-9a-f]{8}$/i);
  });

  test('typography composite nests multi-weight styles', () => {
    expect(get(tokens, 'typography', 'Body', 'Semi Bold', '$type')).toBe('typography');
    const val = get(tokens, 'typography', 'Body', 'Semi Bold', '$value') as Record<string, unknown>;
    expect(val.fontWeight).toBe(600);
    expect(val.fontSize).toEqual({ value: 16, unit: 'px' });
  });

  test('layout groups per breakpoint', () => {
    expect(get(tokens, 'layout', 'mobile', 'columns', '$value')).toBe(4);
    expect(get(tokens, 'layout', 'desktop', 'width', '$value')).toEqual({ value: 1440, unit: 'px' });
  });
});

describe('layout defaults', () => {
  test('three breakpoints with ascending widths and columns', () => {
    expect(DEFAULT_LAYOUT_MODES.map((m) => m.name)).toEqual(['Mobile', 'Tablet', 'Desktop']);
    expect(DEFAULT_LAYOUT_MODES.map((m) => m.width)).toEqual([402, 768, 1440]);
    expect(DEFAULT_LAYOUT_MODES.map((m) => m.columns)).toEqual([4, 8, 12]);
  });
});
