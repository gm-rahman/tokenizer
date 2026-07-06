# Design: Token Generator — modern UI + multi-font typography + layered tokens

**Date:** 2026-07-06
**Status:** Approved (pending spec review)
**Mockup:** `scratchpad/plugin-mockup.html` → https://claude.ai/code/artifact/259022a8-99b6-49e6-8060-27d437426871

## Goal

Redesign the Figma plugin UI to be modern and sleek, and extend the Typography
and Colors features:

1. **Modern two-column UI** — controls left, live preview right; Figma-native and
   theme-aware; window capped at ≤70% of the viewport height.
2. **Typography** — font **dropdowns** (default + per-style override) sourced from
   Figma's installed fonts; an **editable** list of type styles (add / duplicate /
   rename / delete), not a fixed set; **per-weight** generation (one style can emit
   several weights as separate text styles); a **live specimen** preview.
3. **Colors** — replace the ad-hoc semantic tokens with an **industry-standard
   layered semantic set** (Radix / shadcn / Stripe style), grouped Surface /
   Content / Border / Action / Feedback, each a Light→Dark alias.

Non-goals (YAGNI for this pass): drag-to-reorder styles, importing/exporting token
JSON, non-slate/blue color theory changes, alternate token schemes (Material/Apple/
Geist) — the generator ships the layered set only.

## Constraints (unchanged, must hold)

- Two isolated contexts over `postMessage`: sandbox `src/code.ts` (has `figma`, no
  DOM) and UI iframe `src/ui.tsx` (React, no `figma`). Two Vite builds.
- UI styling uses only `var(--figma-color-*)` — theme-aware, no external fonts/CDNs.
- `src/utils.ts` stays pure (no DOM, no `figma`), importable by both contexts.
- Async Variables / Text-Styles APIs (`documentAccess: dynamic-page`).
- Find-or-update by name; never duplicate.

## Data model (`src/types.ts`)

Typography moves from "fixed levels + sparse overrides" to "an explicit, editable
list of type styles". All scale math is resolved in the UI; the sandbox writes
final values.

```ts
export interface TypeStyle {
  id: string;                       // stable key for React + edits (UI-generated)
  name: string;                     // e.g. "Heading 1", "Overline"
  step: number | null;              // set → fontSize tracks base/ratio/multiplier; null → pinned
  fontSize: number;                 // resolved px
  lineHeight: number;               // px
  letterSpacing: number;            // px
  textCase: 'ORIGINAL' | 'UPPER';
  weights: number[];                // ≥1; each emits a separate text style
  font?: string;                    // per-style font; falls back to payload.fontFamily
}

export interface GenerateTypographyPayload {
  fontFamily: string;               // default font family
  styles: TypeStyle[];
}
```

New sandbox→UI message so the UI can populate font dropdowns:

```ts
// PluginMessage (add)
| { type: 'fonts'; families: string[] }
```

`ColorFamilyInput`, `GenerateColorsPayload`, and the color `space` are unchanged.

## Pure logic (`src/utils.ts`)

Add, keeping the module dependency-free:

- `defaultTypeStyles(baseSize, ratio, multiplier): Omit<TypeStyle,'id'>[]` — seeds
  the default set from `TYPE_LEVELS`, computing size/lineHeight/letterSpacing/
  textCase/weights per the existing category rules. Default set is **8** levels:
  Display, Heading 1–4, Body, Caption, Label. (Body ships with weights `[400, 600]`;
  others single-weight.) The UI attaches `id`s.
- `resolveStyleName(name, weight, weightsCount): string` — `weightsCount === 1`
  → `name`; otherwise `` `${name}/${WEIGHT_TO_STYLE[weight]}` `` (e.g. `Body/Bold`).
  `WEIGHT_TO_STYLE` moves here (shared) or is duplicated minimally; single source
  preferred.
- **Layered semantic token map** — replace the current inline mapping in `code.ts`
  with an exported `SEMANTIC_TOKENS` table describing each token's family+step for
  Light and Dark. Groups and mappings (primitive families: `slate` neutral, `blue`
  accent, plus `green`/`amber`/`red` for feedback):

  | Group | Token | Light | Dark |
  |---|---|---|---|
  | Surface | `bg/canvas` | slate 100 | slate 950 |
  | | `bg/surface` | slate 50 | slate 900 |
  | | `bg/subtle` | slate 100 | slate 900 |
  | | `bg/muted` | slate 200 | slate 800 |
  | Content | `text/primary` | slate 900 | slate 50 |
  | | `text/secondary` | slate 600 | slate 400 |
  | | `text/disabled` | slate 400 | slate 600 |
  | | `text/on-accent` | slate 50 | slate 50 |
  | Border | `border/default` | slate 200 | slate 800 |
  | | `border/strong` | slate 300 | slate 700 |
  | | `border/focus` | blue 500 | blue 400 |
  | Action | `action/primary` | blue 600 | blue 500 |
  | | `action/primary-hover` | blue 700 | blue 400 |
  | | `action/secondary` | slate 200 | slate 800 |
  | Feedback | `success` | green 600 | green 500 |
  | | `warning` | amber 500 | amber 400 |
  | | `danger` | red 600 | red 500 |

  Every token is a `VariableAlias` onto a primitive step (no raw color values;
  `text/on-accent` uses the lightest neutral step rather than a literal white).
  Tokens reference primitives by **role**, not literal family name: neutral→first
  family (or a family named `slate`/`gray`/`neutral` if present), accent→second
  family (or `blue`/`brand`), feedback→families named `green`/`amber`/`red` when
  present. If a referenced role/family is absent, that token is **skipped** (and
  reported), so semantic generation degrades gracefully instead of erroring.

## Sandbox (`src/code.ts`)

- On init: `figma.showUI(__html__, { width: 760, height: 640, themeColors: true })`
  (≤70% of a typical viewport; keep the existing resize handler), then call
  `figma.listAvailableFontsAsync()`, dedupe to family names, and
  `post({ type: 'fonts', families })`.
- `generateTypography(payload)`: iterate `styles`, then each style's `weights`;
  for each, load `style.font || payload.fontFamily` with the existing
  weight→style-name fallback, find-or-update the text style by
  `resolveStyleName(...)`, and set size/lineHeight/letterSpacing/textCase. Progress
  `total` = Σ weights. No `buildTypeScale` in the sandbox anymore.
- `generateColors`: drive the semantic pass from `SEMANTIC_TOKENS`; resolve each
  token's Light/Dark primitive via the role rules above; skip-and-report missing
  roles.

## UI (`src/ui.tsx`, `src/ui.css`)

**Shell.** Sticky header with a segmented tab control (Typography / Colors) and a
subtle "updates in place" affordance; a two-column `.pl-body` grid
(`minmax(300px,340px) 1fr`), controls left / preview right; sticky footer with a
context count + primary action. Collapses to one column below ~620px. All colors
from `var(--figma-color-*)`; 8px grid; hairline borders; one accent
(`--figma-color-bg-brand`); `tabular-nums` on all figures; visible focus rings;
`prefers-reduced-motion` respected.

**Typography tab.**
- Default font `<select>` populated from the `fonts` message (fallback to a small
  static list until it arrives).
- Scale card: Base size, Ratio (select), Multiplier. Editing these live-updates the
  `fontSize` of styles whose `step !== null`; pinned styles keep their value.
- Style list: each row = name (inline edit), per-style font `<select>` (blank =
  "— default font —"), size/lineHeight/letterSpacing, uppercase toggle, weight
  chips (multi-select, min 1), duplicate + delete. A "Reset to defaults" re-seeds
  from `defaultTypeStyles`. "+ Add style" appends a pinned Body-like style.
- Live specimen (right): per style, a label with resolved `size/lineHeight/font`
  and one specimen line **per selected weight** (renders the actual face only if
  installed in the iframe; size/weight/spacing always exact).

**Colors tab.**
- Left: color-space segmented control (OKLCH/HSL/HSB), families card
  (name + hex + swatch + remove, "+ Add family"), "Generate Light/Dark semantic
  tokens" toggle. Default families seed with `slate`, `blue`, `green`, `amber`,
  `red` so Feedback resolves out of the box.
- Right preview: **Ramps + Tokens** — compact 11-step ramps per family (hover for
  hex) at top, then the grouped semantic list with **dual Light/Dark chips** per
  token showing it resolving per mode.

## Testing

Add **vitest** (dev dependency; `test` script). Unit-test the pure seams in
`utils.ts`:

- `defaultTypeStyles` — count (8), names, that stepped sizes follow
  `base·ratio^step·multiplier`, Body has two weights, Label is UPPER.
- `resolveStyleName` — single vs multi-weight naming.
- `SEMANTIC_TOKENS` / resolver — every token maps to a valid primitive step for
  both modes; role fallback picks the right family; missing role → skipped.
- Existing color math (`generateScale`, conversions) — a couple of guard tests.

Full verification: `npm run typecheck && npm run lint && npm test && npm run build`,
then manual load in Figma (import manifest, run both tabs, confirm find-or-update).

## Files touched

- `src/types.ts` — `TypeStyle`, revised `GenerateTypographyPayload`, `fonts` msg.
- `src/utils.ts` — `defaultTypeStyles`, `resolveStyleName`, `SEMANTIC_TOKENS` +
  resolver; keep pure.
- `src/code.ts` — font list post, window size, weight-loop typography, token-map
  color pass.
- `src/ui.tsx` — new shell + rewritten Typography tab + updated Colors tab.
- `src/ui.css` — two-column layout, cards, chips, specimen, dual-chip tokens.
- `package.json` — vitest dev dep + `test` script; `*.test.ts` files.
- `CLAUDE.md` — note the new typography model, layered tokens, and `test` command.

## Risks / edge cases

- **Preview font fidelity**: iframe can't load Figma-only fonts → face may fall
  back; documented in the UI ("shown only if installed"). Metrics stay exact.
- **Weight availability**: a family may lack a requested weight → existing
  load-with-fallback to Regular; acceptable.
- **Missing feedback families**: handled by skip-and-report.
- **Re-run safety**: renaming a style creates a new text style rather than renaming
  the old (find-or-update is by name). Acceptable for v1; note in UI copy that
  renaming leaves the previously-generated style in place.
