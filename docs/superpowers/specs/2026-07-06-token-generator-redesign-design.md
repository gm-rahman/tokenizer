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

**Color families gain an explicit semantic role** — this is how the plugin knows
which family is Primary vs Neutral vs Success, instead of guessing by name or
position:

```ts
export type ColorRole =
  | 'neutral' | 'primary' | 'secondary'
  | 'success' | 'warning' | 'danger' | 'none';

export interface ColorFamilyInput {
  name: string;      // variable prefix, e.g. "slate" → slate/500 (unchanged)
  baseHex: string;   // ramp base (unchanged)
  role: ColorRole;   // NEW — drives semantic-token resolution
}
```

`role` is family **metadata**, independent of `name`: renaming `blue`→`brand`
doesn't change which family is Primary. `GenerateColorsPayload` and `space` are
otherwise unchanged.

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
- `resolveSemanticTokens(families): { plan, skipped, missingRequired }` — pure
  role resolver. For each entry in `SEMANTIC_TOKENS`, find the family whose `role`
  matches (first-wins; `action/secondary` falls back `secondary`→`neutral`) and
  emit `{ token, lightFamily, lightStep, darkFamily, darkStep }` into `plan`.
  Collect roles referenced but unassigned into `skipped`; if `neutral` or `primary`
  is missing, list them in `missingRequired`. `code.ts` turns `plan` into
  `VariableAlias`es and uses `skipped`/`missingRequired` for its notify text.
- **Layered semantic token map** — replace the current inline mapping in `code.ts`
  with an exported `SEMANTIC_TOKENS` table. Each token names a **role** plus a
  Light step and a Dark step; the resolver looks up the family assigned that role
  and aliases the matching primitive. No token hard-codes a family name.

  | Group | Token | Role | Light step | Dark step |
  |---|---|---|---|---|
  | Surface | `bg/canvas` | neutral | 100 | 950 |
  | | `bg/surface` | neutral | 50 | 900 |
  | | `bg/subtle` | neutral | 100 | 900 |
  | | `bg/muted` | neutral | 200 | 800 |
  | Content | `text/primary` | neutral | 900 | 50 |
  | | `text/secondary` | neutral | 600 | 400 |
  | | `text/disabled` | neutral | 400 | 600 |
  | | `text/on-accent` | neutral | 50 | 50 |
  | Border | `border/default` | neutral | 200 | 800 |
  | | `border/strong` | neutral | 300 | 700 |
  | | `border/focus` | primary | 500 | 400 |
  | Action | `action/primary` | primary | 600 | 500 |
  | | `action/primary-hover` | primary | 700 | 400 |
  | | `action/secondary` | secondary→neutral | 200 | 800 |
  | Feedback | `success` | success | 600 | 500 |
  | | `warning` | warning | 500 | 400 |
  | | `danger` | danger | 600 | 500 |

  **Role resolution rules:**
  - Each token aliases the family whose `role` matches, at the given step, for each
    mode. Every token is a `VariableAlias` onto a primitive step (no raw values;
    `text/on-accent` uses the lightest neutral step, not a literal white).
  - **`action/secondary` fallback** (the "support both" decision): use the
    `secondary` family if one is tagged; otherwise fall back to `neutral`. Same
    200→800 steps either way, so a tagged secondary hue reads as a soft tint and the
    neutral fallback reads as a quiet gray.
  - **Required roles:** `neutral` and `primary`. If either is missing, semantic
    generation is aborted with a clear `figma.notify` message (primitives still
    generate).
  - **Optional roles:** `secondary`, `success`, `warning`, `danger`. Tokens whose
    role is unassigned are **skipped and reported** in the done message
    (e.g. "16 tokens · skipped success, warning — no family tagged"), so the pass
    degrades gracefully.
  - **Duplicate roles:** if two families share a role, the first (top-most) wins.
    A `none` role never participates in semantic tokens (primitives only).

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
- `generateColors`: call `resolveSemanticTokens(families)`. If `missingRequired` is
  non-empty, skip the semantic pass and `figma.notify` which required roles are
  unassigned. Otherwise create/update each planned token as a Light/Dark
  `VariableAlias` onto the corresponding primitive variable, and include `skipped`
  roles in the done message.

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
- Left: color-space segmented control (OKLCH/HSL/HSB), families card, and the
  "Generate Light/Dark semantic tokens" toggle. Each family row shows name + hex +
  swatch + **Role dropdown** (Neutral / Primary / Secondary / Success / Warning /
  Danger / None) + remove, plus "+ Add family". Default families seed with roles
  pre-assigned: `slate`→Neutral, `blue`→Primary, `green`→Success, `amber`→Warning,
  `red`→Danger, so every token resolves out of the box. A small inline hint flags
  when a required role (Neutral/Primary) is unassigned.
- Right preview: **Ramps + Tokens** — compact 11-step ramps per family (hover for
  hex) at top, then the grouped semantic list with **dual Light/Dark chips** per
  token showing it resolving per mode.

## Testing

Add **vitest** (dev dependency; `test` script). Unit-test the pure seams in
`utils.ts`:

- `defaultTypeStyles` — count (8), names, that stepped sizes follow
  `base·ratio^step·multiplier`, Body has two weights, Label is UPPER.
- `resolveStyleName` — single vs multi-weight naming.
- `resolveSemanticTokens` — default families produce a full plan with no skips;
  `action/secondary` falls back neutral→secondary correctly; a tagged `secondary`
  family is preferred; dropping `green` skips only `success`; dropping the neutral
  or primary family reports `missingRequired`; duplicate roles → first wins.
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
