import { describe, test, expect } from 'vitest';
import { defaultTypeStyles, resolveStyleName, resolveSemanticTokens } from './utils';
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
    expect(plan).toHaveLength(17);
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
    expect(plan).toHaveLength(16);
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
