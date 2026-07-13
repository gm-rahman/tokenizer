import { useEffect, useMemo, useState } from 'react';
import {
  generateScale,
  defaultTypeStyles,
  resolveSemanticTokens,
  SEMANTIC_TOKENS,
  SPACING_SCALE,
  RADIUS_SCALE,
  ELEVATION_LEVELS,
  SYSTEM_TOKEN_GROUPS,
  DEFAULT_SHADOW_TINT,
  DEFAULT_LAYOUT_MODES,
  LAYOUT_VARIABLES,
  textStyleVariables,
} from './utils';
import type { LayoutMode } from './utils';
import type {
  UiMessage,
  PluginMessage,
  ColorSpace,
  ColorFamilyInput,
  ColorRole,
  TypeStyle,
} from './types';

type Tab = 'typography' | 'colors' | 'system' | 'layout' | 'convert';

function sendMessage(msg: UiMessage): void {
  window.parent.postMessage({ pluginMessage: msg }, '*');
}

const SCALE_RATIOS = [
  { name: 'Minor Third', value: 1.2 },
  { name: 'Major Third', value: 1.25 },
  { name: 'Perfect Fourth', value: 1.333 },
  { name: 'Augmented Fourth', value: 1.414 },
  { name: 'Perfect Fifth', value: 1.5 },
  { name: 'Golden Ratio', value: 1.618 },
];

const COLOR_ROLES: ColorRole[] = [
  'neutral',
  'primary',
  'secondary',
  'success',
  'warning',
  'danger',
  'none',
];

const WEIGHT_OPTIONS = [300, 400, 500, 600, 700, 800];

const DEFAULT_FAMILIES: ColorFamilyInput[] = [
  { name: 'slate', baseHex: '#64748b', role: 'neutral' },
  { name: 'blue', baseHex: '#3b82f6', role: 'primary' },
  { name: 'violet', baseHex: '#8b5cf6', role: 'secondary' },
  { name: 'green', baseHex: '#16a34a', role: 'success' },
  { name: 'amber', baseHex: '#f59e0b', role: 'warning' },
  { name: 'red', baseHex: '#dc2626', role: 'danger' },
];

const FONT_FALLBACK = ['Inter', 'Roboto', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman'];

const HEX_RE = /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;

let idCounter = 0;
const uid = (): string => `ts${++idCounter}`;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function safeScale(hex: string, space: ColorSpace) {
  if (!HEX_RE.test(hex.trim())) return [];
  try {
    return generateScale(hex, space);
  } catch {
    return [];
  }
}

function normalizeHex(hex: string): string {
  const t = hex.trim();
  if (/^#?[0-9a-fA-F]{6}$/.test(t)) return t.startsWith('#') ? t : `#${t}`;
  return '#000000';
}

function seedStyles(base: number, ratio: number, mult: number): TypeStyle[] {
  return defaultTypeStyles(base, ratio, mult).map((s) => ({ ...s, id: uid() }));
}

// Recompute stepped styles when the scale changes; pinned styles (step===null)
// keep their value. Line-height / tracking scale proportionally with size.
function applyScale(styles: TypeStyle[], base: number, ratio: number, mult: number): TypeStyle[] {
  return styles.map((s) => {
    if (s.step === null) return s;
    const newSize = Math.round(base * Math.pow(ratio, s.step) * mult);
    if (newSize === s.fontSize) return s;
    const lhRatio = s.fontSize ? s.lineHeight / s.fontSize : 1.4;
    const lsRatio = s.fontSize ? s.letterSpacing / s.fontSize : 0;
    return {
      ...s,
      fontSize: newSize,
      lineHeight: Math.round(newSize * lhRatio),
      letterSpacing: round2(newSize * lsRatio),
    };
  });
}

interface Toast {
  kind: 'info' | 'success' | 'error';
  message: string;
}

export function App() {
  const [tab, setTab] = useState<Tab>('typography');
  const [toast, setToast] = useState<Toast | null>(null);
  const [busy, setBusy] = useState(false);
  const [fonts, setFonts] = useState<string[]>(FONT_FALLBACK);
  const [textStyleNames, setTextStyleNames] = useState<string[]>([]);

  // Colors state
  const [families, setFamilies] = useState<ColorFamilyInput[]>(DEFAULT_FAMILIES);
  const [space, setSpace] = useState<ColorSpace>('oklch');
  const [semantic, setSemantic] = useState(true);

  // Typography state
  const [fontFamily, setFontFamily] = useState('Inter');
  const [baseSize, setBaseSize] = useState(16);
  const [ratio, setRatio] = useState(1.25);
  const [multiplier, setMultiplier] = useState(1);
  const [styles, setStyles] = useState<TypeStyle[]>(() => seedStyles(16, 1.25, 1));

  // Universal design-system state
  const [shadowTint, setShadowTint] = useState(DEFAULT_SHADOW_TINT);
  const [includeEffects, setIncludeEffects] = useState(true);

  // Layout & breakpoints state
  const [layoutModes, setLayoutModes] = useState<LayoutMode[]>(() =>
    DEFAULT_LAYOUT_MODES.map((m) => ({ ...m })),
  );

  // Whole-system pass
  const [includeDocs, setIncludeDocs] = useState(true);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const msg = event.data?.pluginMessage as PluginMessage | undefined;
      if (!msg) return;
      if (msg.type === 'fonts') {
        setFonts(msg.families.length ? msg.families : FONT_FALLBACK);
      } else if (msg.type === 'text-styles') {
        setTextStyleNames(msg.names);
      } else if (msg.type === 'progress') {
        setBusy(true);
        setToast({ kind: 'info', message: `${msg.message} (${msg.current}/${msg.total})` });
      } else if (msg.type === 'done') {
        setBusy(false);
        setToast({ kind: 'success', message: msg.message });
      } else if (msg.type === 'error') {
        setBusy(false);
        setToast({ kind: 'error', message: msg.message });
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Keep the default font valid once the real font list arrives.
  useEffect(() => {
    if (fonts.length && !fonts.includes(fontFamily)) {
      setFontFamily(fonts.includes('Inter') ? 'Inter' : fonts[0]);
    }
  }, [fonts, fontFamily]);

  function rescale(next: { base?: number; ratio?: number; mult?: number }) {
    const b = next.base ?? baseSize;
    const r = next.ratio ?? ratio;
    const m = next.mult ?? multiplier;
    if (next.base !== undefined) setBaseSize(b);
    if (next.ratio !== undefined) setRatio(r);
    if (next.mult !== undefined) setMultiplier(m);
    setStyles((prev) => applyScale(prev, b, r, m));
  }

  function handleGenerate() {
    setToast(null);
    if (tab === 'colors') {
      sendMessage({
        type: 'generate-colors',
        payload: { families, space, generateSemanticTokens: semantic },
      });
    } else if (tab === 'system') {
      sendMessage({ type: 'generate-system', payload: { shadowTint, includeEffectStyles: includeEffects } });
    } else if (tab === 'layout') {
      sendMessage({ type: 'generate-layout', payload: { modes: layoutModes } });
    } else if (tab === 'convert') {
      sendMessage({ type: 'generate-text-variables' });
    } else {
      sendMessage({ type: 'generate-typography', payload: { fontFamily, styles } });
    }
  }

  function handleGenerateAll() {
    setToast(null);
    sendMessage({
      type: 'generate-all',
      payload: {
        colors: { families, space, generateSemanticTokens: semantic },
        typography: { fontFamily, styles },
        system: { shadowTint, includeEffectStyles: includeEffects },
        layout: { modes: layoutModes },
        includeDocsPage: includeDocs,
      },
    });
  }

  const textStyleCount = styles.reduce((n, s) => n + Math.max(1, s.weights.length), 0);
  const systemGroupVars = SYSTEM_TOKEN_GROUPS.reduce((n, g) => n + g.tokens.length, 0);
  const systemVarCount =
    SPACING_SCALE.length + RADIUS_SCALE.length + 1 + ELEVATION_LEVELS.length * 5 + systemGroupVars;
  const footNote =
    tab === 'typography'
      ? `${styles.length} styles · ${textStyleCount} text styles`
      : tab === 'colors'
        ? `${families.length} families · ${families.length * 11} primitives${
            semantic ? ' · semantic tokens' : ''
          }`
        : tab === 'system'
          ? `${systemVarCount} variables${includeEffects ? ` · ${ELEVATION_LEVELS.length} effect styles` : ''}`
          : tab === 'layout'
            ? `${layoutModes.length} modes · ${LAYOUT_VARIABLES.length} grid variables`
            : `${textStyleNames.length} text styles · ${textStyleNames.length * 6} variables`;

  const generateLabel =
    tab === 'typography'
      ? 'Generate typography'
      : tab === 'colors'
        ? 'Generate variables'
        : tab === 'system'
          ? 'Generate design system'
          : tab === 'layout'
            ? 'Generate layout variables'
            : 'Convert text styles';

  return (
    <div className="app">
      <header className="pl-head">
        <div className="brand">
          <span className="mark" />
          <b>Token Generator</b>
        </div>
        <div className="tabs" role="tablist">
          {(
            [
              ['typography', 'Typography'],
              ['colors', 'Colors'],
              ['system', 'System'],
              ['layout', 'Layout'],
              ['convert', 'Convert'],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              className={tab === id ? 'active' : ''}
              aria-selected={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="pl-body">
        {tab === 'typography' && (
          <TypographyTab
            fonts={fonts}
            fontFamily={fontFamily}
            setFontFamily={setFontFamily}
            baseSize={baseSize}
            ratio={ratio}
            multiplier={multiplier}
            rescale={rescale}
            styles={styles}
            setStyles={setStyles}
            reset={() => setStyles(seedStyles(baseSize, ratio, multiplier))}
          />
        )}
        {tab === 'colors' && (
          <ColorsTab
            families={families}
            setFamilies={setFamilies}
            space={space}
            setSpace={setSpace}
            semantic={semantic}
            setSemantic={setSemantic}
          />
        )}
        {tab === 'system' && (
          <SystemTab
            shadowTint={shadowTint}
            setShadowTint={setShadowTint}
            includeEffects={includeEffects}
            setIncludeEffects={setIncludeEffects}
          />
        )}
        {tab === 'layout' && <LayoutTab modes={layoutModes} setModes={setLayoutModes} />}
        {tab === 'convert' && <ConvertTab names={textStyleNames} />}
      </main>

      <footer className="pl-foot">
        {toast && <div className={`toast ${toast.kind}`}>{toast.message}</div>}
        <div className="foot-row">
          <label className="foot-docs" title="Draw a documentation page on the canvas">
            <input type="checkbox" checked={includeDocs} onChange={(e) => setIncludeDocs(e.target.checked)} />
            Docs page
          </label>
          <span className="foot-note">{footNote}</span>
          <button type="button" className="ghost" disabled={busy} onClick={handleGenerateAll}>
            Generate entire system
          </button>
          <button type="button" className="primary" disabled={busy} onClick={handleGenerate}>
            {busy ? 'Generating…' : generateLabel}
          </button>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

const SPECIMENS: Record<string, string> = {
  Display: 'Design tokens, generated.',
  'Heading 1': 'Build a system, not a screen',
  'Heading 2': 'Primitives, tokens, and type',
  'Heading 3': 'Eleven steps per family',
  'Heading 4': 'Light and dark in one pass',
  Body: 'Every ramp and token is written straight into your Figma file — rerun to update in place.',
  Caption: 'Generated with modular-scale math',
  Label: 'Foundations',
};

function TypographyTab(props: {
  fonts: string[];
  fontFamily: string;
  setFontFamily: (v: string) => void;
  baseSize: number;
  ratio: number;
  multiplier: number;
  rescale: (n: { base?: number; ratio?: number; mult?: number }) => void;
  styles: TypeStyle[];
  setStyles: React.Dispatch<React.SetStateAction<TypeStyle[]>>;
  reset: () => void;
}) {
  const { fonts, fontFamily, setFontFamily, baseSize, ratio, multiplier, rescale, styles, setStyles, reset } = props;

  function update(id: string, patch: Partial<TypeStyle>) {
    setStyles((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function duplicate(id: string) {
    setStyles((prev) => {
      const i = prev.findIndex((s) => s.id === id);
      if (i < 0) return prev;
      const copy = { ...prev[i], id: uid(), name: `${prev[i].name} copy`, weights: [...prev[i].weights] };
      return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
    });
  }
  function remove(id: string) {
    setStyles((prev) => (prev.length > 1 ? prev.filter((s) => s.id !== id) : prev));
  }
  function addStyle() {
    setStyles((prev) => [
      ...prev,
      {
        id: uid(),
        name: 'New style',
        step: null,
        fontSize: baseSize,
        lineHeight: Math.round(baseSize * 1.5),
        letterSpacing: 0,
        textCase: 'ORIGINAL',
        weights: [400],
      },
    ]);
  }
  function toggleWeight(id: string, w: number) {
    setStyles((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const has = s.weights.includes(w);
        if (has && s.weights.length === 1) return s;
        const weights = has ? s.weights.filter((x) => x !== w) : [...s.weights, w].sort((a, b) => a - b);
        return { ...s, weights };
      }),
    );
  }

  return (
    <>
      <div className="controls">
        <label className="field">
          <span className="flabel">Default font</span>
          <select className="control" value={fontFamily} onChange={(e) => setFontFamily(e.target.value)}>
            {fonts.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>

        <div className="field">
          <span className="flabel">Modular scale</span>
          <div className="card grid3">
            <label className="mini">
              <span>Base</span>
              <input
                className="control"
                type="number"
                value={baseSize}
                onChange={(e) => rescale({ base: Number(e.target.value) || 16 })}
              />
            </label>
            <label className="mini">
              <span>Ratio</span>
              <select
                className="control"
                value={ratio}
                onChange={(e) => rescale({ ratio: Number(e.target.value) })}
              >
                {SCALE_RATIOS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.value}
                  </option>
                ))}
              </select>
            </label>
            <label className="mini">
              <span>Scale</span>
              <input
                className="control"
                type="number"
                step="0.05"
                value={multiplier}
                onChange={(e) => rescale({ mult: Number(e.target.value) || 1 })}
              />
            </label>
          </div>
        </div>

        <div className="field">
          <div className="styles-head">
            <span className="flabel">Styles</span>
            <button type="button" className="linkbtn" onClick={reset}>
              Reset to defaults
            </button>
          </div>
          <div className="rows">
            {styles.map((s) => (
              <div className="row" key={s.id}>
                <div className="row-top">
                  <input
                    className="row-name"
                    value={s.name}
                    aria-label="Style name"
                    onChange={(e) => update(s.id, { name: e.target.value })}
                  />
                  <button
                    type="button"
                    className={s.textCase === 'UPPER' ? 'case on' : 'case'}
                    title="Uppercase"
                    onClick={() =>
                      update(s.id, { textCase: s.textCase === 'UPPER' ? 'ORIGINAL' : 'UPPER' })
                    }
                  >
                    AA
                  </button>
                  <button type="button" className="iconbtn" title="Duplicate" onClick={() => duplicate(s.id)}>
                    ⧉
                  </button>
                  <button type="button" className="iconbtn" title="Delete" onClick={() => remove(s.id)}>
                    ×
                  </button>
                </div>
                <div className="row-nums">
                  <label className="numf">
                    <span>Size</span>
                    <input
                      className="control"
                      type="number"
                      value={s.fontSize}
                      onChange={(e) => update(s.id, { fontSize: Number(e.target.value) || 0, step: null })}
                    />
                  </label>
                  <label className="numf">
                    <span>LH</span>
                    <input
                      className="control"
                      type="number"
                      value={s.lineHeight}
                      onChange={(e) => update(s.id, { lineHeight: Number(e.target.value) || 0 })}
                    />
                  </label>
                  <label className="numf">
                    <span>Track</span>
                    <input
                      className="control"
                      type="number"
                      step="0.1"
                      value={s.letterSpacing}
                      onChange={(e) => update(s.id, { letterSpacing: Number(e.target.value) || 0 })}
                    />
                  </label>
                </div>
                <div className="row-sub">
                  <select
                    className="control fontpick"
                    value={s.font ?? ''}
                    aria-label="Style font"
                    onChange={(e) => update(s.id, { font: e.target.value || undefined })}
                  >
                    <option value="">— default font —</option>
                    {fonts.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                  <div className="chips">
                    {WEIGHT_OPTIONS.map((w) => (
                      <button
                        type="button"
                        key={w}
                        className={s.weights.includes(w) ? 'chip on' : 'chip'}
                        onClick={() => toggleWeight(s.id, w)}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="addbtn" onClick={addStyle}>
            + Add style
          </button>
        </div>
      </div>

      <div className="preview">
        <div className="pv-head">
          <span className="flabel">Live specimen</span>
          <em>font shown if installed · size &amp; spacing exact</em>
        </div>
        <div className="spec">
          {styles.map((s) => {
            const face = `'${s.font || fontFamily}', Inter, sans-serif`;
            const text = SPECIMENS[s.name] ?? 'The quick brown fox jumps over the lazy dog';
            return (
              <div className="spec-item" key={s.id}>
                <div className="spec-label">
                  <b>{s.name || 'Untitled'}</b>
                  <span className="rule" />
                  <span className="num">
                    {s.fontSize}px · {s.lineHeight} · {s.font || fontFamily}
                  </span>
                </div>
                {s.weights.map((w) => (
                  <div
                    key={w}
                    className="spec-line"
                    style={{
                      fontFamily: face,
                      fontSize: s.fontSize,
                      lineHeight: `${s.lineHeight}px`,
                      fontWeight: w,
                      letterSpacing: `${s.letterSpacing}px`,
                      textTransform: s.textCase === 'UPPER' ? 'uppercase' : 'none',
                    }}
                  >
                    {text}
                    {s.weights.length > 1 && <small>{w}</small>}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

function tokenGroup(name: string): string {
  if (name.startsWith('bg/')) return 'Surface';
  if (name.startsWith('text/')) return 'Content';
  if (name.startsWith('border/')) return 'Border';
  if (name.startsWith('action/')) return 'Action';
  return 'Feedback';
}

function ColorsTab(props: {
  families: ColorFamilyInput[];
  setFamilies: (f: ColorFamilyInput[]) => void;
  space: ColorSpace;
  setSpace: (s: ColorSpace) => void;
  semantic: boolean;
  setSemantic: (v: boolean) => void;
}) {
  const { families, setFamilies, space, setSpace, semantic, setSemantic } = props;

  function updateFamily(i: number, patch: Partial<ColorFamilyInput>) {
    setFamilies(families.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function addFamily() {
    setFamilies([...families, { name: 'gray', baseHex: '#888888', role: 'none' }]);
  }
  function removeFamily(i: number) {
    setFamilies(families.filter((_, idx) => idx !== i));
  }

  // hex lookup per family/step for the semantic token chips
  const scales = useMemo(() => {
    const map = new Map<string, Map<number, string>>();
    for (const f of families) {
      const steps = safeScale(f.baseHex, space);
      if (steps.length) map.set(f.name, new Map(steps.map((s) => [s.step, s.hex])));
    }
    return map;
  }, [families, space]);

  const hexFor = (family: string, step: number) => scales.get(family)?.get(step) ?? '#8884';

  const resolution = useMemo(() => resolveSemanticTokens(families), [families]);
  const referencedRoles = useMemo(() => new Set(SEMANTIC_TOKENS.map((t) => t.role)), []);

  const hasNeutral = families.some((f) => f.role === 'neutral');
  const hasPrimary = families.some((f) => f.role === 'primary');

  let lastGroup = '';

  return (
    <>
      <div className="controls">
        <div className="field">
          <span className="flabel">Color space</span>
          <div className="segmented">
            {(['oklch', 'hsl', 'hsb'] as ColorSpace[]).map((s) => (
              <button
                type="button"
                key={s}
                className={space === s ? 'active' : ''}
                onClick={() => setSpace(s)}
              >
                {s.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="flabel">Families &amp; roles</span>
          <div className="card">
            {families.map((f, i) => (
              <div className="fam" key={i}>
                <input
                  className="swatch-input"
                  type="color"
                  aria-label="Base color"
                  value={normalizeHex(f.baseHex)}
                  onChange={(e) => updateFamily(i, { baseHex: e.target.value })}
                />
                <input
                  className="control fname"
                  value={f.name}
                  aria-label="Family name"
                  onChange={(e) => updateFamily(i, { name: e.target.value })}
                />
                <select
                  className="control role"
                  value={f.role}
                  aria-label="Role"
                  onChange={(e) => updateFamily(i, { role: e.target.value as ColorRole })}
                >
                  {COLOR_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r[0].toUpperCase() + r.slice(1)}
                    </option>
                  ))}
                </select>
                {families.length > 1 && (
                  <button type="button" className="iconbtn" aria-label="Remove" onClick={() => removeFamily(i)}>
                    ×
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="addbtn" onClick={addFamily}>
              + Add color family
            </button>
            {semantic && (!hasNeutral || !hasPrimary) && (
              <div className="rolehint">
                ⚠ {[!hasNeutral && 'Neutral', !hasPrimary && 'Primary'].filter(Boolean).join(' & ')} role
                unassigned — semantic tokens need it.
              </div>
            )}
          </div>
        </div>

        <label className="checkbox">
          <input type="checkbox" checked={semantic} onChange={(e) => setSemantic(e.target.checked)} />
          Generate Light / Dark semantic tokens
        </label>
      </div>

      <div className="preview">
        <div className="pv-head">
          <span className="flabel">Preview</span>
          <em>ramps · Light → Dark tokens</em>
        </div>

        {families.map((f, i) => {
          const steps = safeScale(f.baseHex, space);
          if (!steps.length) return null;
          return (
            <div className="cv-fam" key={i}>
              <div className="cv-cap">
                <b>{f.name}</b>
                <span>{f.role !== 'none' ? f.role : '50 – 950'}</span>
              </div>
              <div className="ramp">
                {steps.map((s) => (
                  <i key={s.step} style={{ background: s.hex }} title={`${f.name}/${s.step} · ${s.hex}`} />
                ))}
              </div>
            </div>
          );
        })}

        {semantic && (
          <div className="tokens">
            {resolution.plan.map((t) => {
              const group = tokenGroup(t.token);
              const header = group !== lastGroup ? ((lastGroup = group), group) : null;
              return (
                <div key={t.token}>
                  {header && <div className="cv-sub">{header}</div>}
                  <div className="cv-tok">
                    <div className="pair">
                      <span style={{ background: hexFor(t.lightFamily, t.lightStep) }} />
                      <span style={{ background: hexFor(t.darkFamily, t.darkStep) }} />
                    </div>
                    <div className="cv-lab">
                      <b>{t.token}</b>
                      <em>
                        {t.lightFamily}/{t.lightStep} · {t.darkFamily}/{t.darkStep}
                      </em>
                    </div>
                  </div>
                </div>
              );
            })}
            {resolution.skipped.filter((r) => referencedRoles.has(r)).length > 0 && (
              <div className="rolehint">Skipped {resolution.skipped.join(', ')} — no family tagged.</div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// System (universal design system: spacing / radii / elevation)
// ---------------------------------------------------------------------------

function SystemTab(props: {
  shadowTint: string;
  setShadowTint: (v: string) => void;
  includeEffects: boolean;
  setIncludeEffects: (v: boolean) => void;
}) {
  const { shadowTint, setShadowTint, includeEffects, setIncludeEffects } = props;
  const maxSpace = SPACING_SCALE[SPACING_SCALE.length - 1].value;

  return (
    <>
      <div className="controls">
        <div className="field">
          <span className="flabel">Universal system</span>
          <div className="card">
            <p className="note">
              One opinionated token set distilled from the W3C DTCG taxonomy, Material 3, Tailwind,
              and Radix — written to a <b>Design System</b> collection: <b>{SPACING_SCALE.length}</b>{' '}
              spacing steps, <b>{RADIUS_SCALE.length}</b> radii, <b>{ELEVATION_LEVELS.length}</b>{' '}
              elevation levels, plus motion, opacity, state layers, border widths, z-index, focus, and
              icon sizes.
            </p>
          </div>
        </div>

        <label className="field">
          <span className="flabel">Shadow tint</span>
          <div className="card fam" style={{ marginBottom: 0 }}>
            <input
              className="swatch-input"
              type="color"
              aria-label="Shadow tint"
              value={/^#[0-9a-fA-F]{6}$/.test(shadowTint) ? shadowTint : '#101828'}
              onChange={(e) => setShadowTint(e.target.value)}
            />
            <input
              className="control fname"
              value={shadowTint}
              aria-label="Shadow tint hex"
              onChange={(e) => setShadowTint(e.target.value)}
            />
          </div>
        </label>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={includeEffects}
            onChange={(e) => setIncludeEffects(e.target.checked)}
          />
          Also create drop-shadow Effect Styles (elevation/1–{ELEVATION_LEVELS.length})
        </label>
      </div>

      <div className="preview">
        <div className="pv-head">
          <span className="flabel">Preview</span>
          <em>spacing · radii · elevation</em>
        </div>

        <div className="cv-sub">Spacing</div>
        <div className="sys-list">
          {SPACING_SCALE.map((s) => (
            <div className="sys-row" key={s.name}>
              <span className="sys-key">space/{s.name}</span>
              <span className="sys-bar" style={{ width: `${(s.value / maxSpace) * 100}%` }} />
              <span className="sys-val">{s.value}</span>
            </div>
          ))}
        </div>

        <div className="cv-sub">Radii</div>
        <div className="sys-radii">
          {RADIUS_SCALE.map((r) => (
            <div className="sys-radius" key={r.name}>
              <span
                className="sys-swatch"
                style={{ borderRadius: Math.min(r.value, 22) }}
                title={`radius/${r.name} · ${r.value}`}
              />
              <span className="sys-key">{r.name}</span>
              <span className="sys-val">{r.value}</span>
            </div>
          ))}
        </div>

        <div className="cv-sub">Elevation</div>
        <div className="sys-elev">
          {ELEVATION_LEVELS.map((e) => {
            const rgb = /^#[0-9a-fA-F]{6}$/.test(shadowTint) ? shadowTint : '#101828';
            const shadow = `${e.x}px ${e.y}px ${e.blur}px ${e.spread}px ${hexAlpha(rgb, e.opacity)}`;
            return (
              <div className="sys-elev-item" key={e.level}>
                <span className="sys-elev-box" style={{ boxShadow: shadow }} />
                <span className="sys-key">elevation/{e.level}</span>
                <span className="sys-val">
                  y{e.y} · b{e.blur} · {e.opacity}%
                </span>
              </div>
            );
          })}
        </div>

        {SYSTEM_TOKEN_GROUPS.map((g) => (
          <div key={g.prefix}>
            <div className="cv-sub">{g.label}</div>
            <div className="tok-grid">
              {g.tokens.map((t) => (
                <div className="tok-cell" key={t.name}>
                  <span className="sys-key">
                    {g.prefix}/{t.name}
                  </span>
                  <span className="sys-val">{t.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// rgba() string from a #rrggbb hex + an opacity percentage (0–100).
function hexAlpha(hex: string, opacityPct: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${opacityPct / 100})`;
}

// ---------------------------------------------------------------------------
// Layout & breakpoints
// ---------------------------------------------------------------------------

const LAYOUT_FIELDS: { key: keyof Omit<LayoutMode, 'name'>; label: string }[] = [
  { key: 'width', label: 'Width' },
  { key: 'columns', label: 'Columns' },
  { key: 'margin', label: 'Margin' },
  { key: 'gutter', label: 'Gutter' },
];

function LayoutTab(props: {
  modes: LayoutMode[];
  setModes: React.Dispatch<React.SetStateAction<LayoutMode[]>>;
}) {
  const { modes, setModes } = props;

  function update(i: number, patch: Partial<LayoutMode>) {
    setModes((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }

  return (
    <>
      <div className="controls">
        <div className="field">
          <span className="flabel">Breakpoints &amp; grid</span>
          <div className="card">
            <p className="note">
              A <b>Layout &amp; Breakpoints</b> collection with one mode per breakpoint. Each Number
              variable resolves per mode, ready to bind to Layout Grid columns, margin, and gutter.
            </p>
          </div>
        </div>

        {modes.map((m, i) => (
          <div className="field" key={i}>
            <span className="flabel">{m.name}</span>
            <div className="card grid-2x2">
              {LAYOUT_FIELDS.map((f) => (
                <label className="mini" key={f.key}>
                  <span>{f.label}</span>
                  <input
                    className="control"
                    type="number"
                    value={m[f.key]}
                    onChange={(e) => update(i, { [f.key]: Number(e.target.value) || 0 })}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
        <p className="note">
          Figma Number variables cannot be auto, so the desktop margin is a concrete value — edit it
          to suit your max-width.
        </p>
      </div>

      <div className="preview">
        <div className="pv-head">
          <span className="flabel">Preview</span>
          <em>columns · margin · gutter</em>
        </div>
        {modes.map((m, i) => (
          <div className="lay-mode" key={i}>
            <div className="cv-cap">
              <b>{m.name}</b>
              <span>
                {m.width}px · {m.columns} cols
              </span>
            </div>
            <div className="lay-grid" style={{ padding: `0 ${Math.min(m.margin, 40)}px`, gap: Math.min(m.gutter, 16) }}>
              {Array.from({ length: m.columns }).map((_, c) => (
                <span className="lay-col" key={c} />
              ))}
            </div>
            <div className="lay-meta">
              margin {m.margin} · gutter {m.gutter}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Convert (local text styles -> variables)
// ---------------------------------------------------------------------------

function ConvertTab(props: { names: string[] }) {
  const { names } = props;

  return (
    <>
      <div className="controls">
        <div className="field">
          <span className="flabel">Text styles → variables</span>
          <div className="card">
            <p className="note">
              Reads every local Text Style and writes matching variables into a{' '}
              <b>Typography Variables</b> collection — two strings (FontFamily, FontWeight) and four
              numbers (FontSize, LineHeight, LetterSpacing, ParagraphSpacing) per style.
            </p>
          </div>
        </div>
        {names.length === 0 ? (
          <div className="rolehint">
            No local text styles found. Generate typography first, then convert.
          </div>
        ) : (
          <p className="note">
            <b>{names.length}</b> text styles found → <b>{names.length * 6}</b> variables.
          </p>
        )}
      </div>

      <div className="preview">
        <div className="pv-head">
          <span className="flabel">Preview</span>
          <em>{names.length} styles</em>
        </div>
        {names.length === 0 ? (
          <p className="note">Nothing to convert yet.</p>
        ) : (
          names.map((name) => (
            <div className="cv-fam" key={name}>
              <div className="cv-cap">
                <b>{name}</b>
              </div>
              <div className="conv-vars">
                {textStyleVariables({
                  name,
                  fontFamily: '',
                  fontWeight: '',
                  fontSize: 0,
                  lineHeight: 0,
                  letterSpacing: 0,
                  paragraphSpacing: 0,
                }).map((v) => (
                  <span className={`conv-chip ${v.type === 'STRING' ? 'str' : 'num'}`} key={v.name}>
                    {v.name.slice(name.length + 1)}
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
