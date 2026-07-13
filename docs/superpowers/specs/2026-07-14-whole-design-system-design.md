# Design: Whole Design System — complete token layers, one-click generate, on-canvas docs, components

**Date:** 2026-07-14
**Status:** Approved
**Supersedes scope of:** `2026-07-06-token-generator-redesign-design.md` (extends, does not replace)

## Goal

Grow the plugin from a foundations/token generator into a **whole, industry-standard
design system** generator, keeping every existing feature. Distilled from the W3C
Design Tokens Community Group taxonomy and Material 3 / Tailwind / Radix / Polaris /
Carbon practice. Per user preference: ship **one unified, merged** opinionated set —
not per-brand modes, not cherry-picking.

The plugin already generates: color primitives + Light/Dark semantic tokens
(`Primitives`, `Tokens` collections), typography (Text Styles), spacing/radii/
elevation (`Design System` collection), breakpoints/grid (`Layout & Breakpoints`),
and text-styles→variables (`Typography Variables`).

**End-state adds:** the remaining foundation token layers, a one-click "Generate
entire system", an on-canvas documentation page, and a wired component library.

## Phasing

- **Phase 1 (this session):** new token layers + one-click generate-all + docs page.
- **Phase 2 (spec only, later):** component library.

---

## Phase 1

### 1. New token layers (`src/utils.ts`, pure data)

All extend the existing **`Design System`** variable collection, `Base` mode, written
by an extended `generateSystem`. Modeled as pure data so they preview in the UI and the
sandbox writes them unchanged — same pattern as `SPACING_SCALE`/`RADIUS_SCALE`.

New exported structure (kept `figma`-free; scopes are plain strings, cast to
`VariableScope` in the sandbox):

```ts
export interface SystemTokenGroup {
  prefix: string;                 // variable group, e.g. "duration" -> duration/fast
  label: string;                  // UI section heading, e.g. "Motion · Duration"
  type: 'FLOAT' | 'STRING';
  scopes: string[];               // Figma VariableScope names; [] = leave default
  tokens: { name: string; value: number | string }[];
}
export const SYSTEM_TOKEN_GROUPS: SystemTokenGroup[];
```

| Group (`prefix`) | Label | Type | Scopes | Tokens |
|---|---|---|---|---|
| `duration` | Motion · Duration | FLOAT | (default) | instant 100, fast 150, normal 200, slow 300, slower 400, slowest 500 |
| `easing` | Motion · Easing | STRING | (none) | linear `(0,0,1,1)`, standard `(.2,0,0,1)`, emphasized `(.05,.7,.1,1)`, decelerate `(0,0,0,1)`, accelerate `(.3,0,1,1)` — each as `cubic-bezier(…)` |
| `opacity` | Opacity | FLOAT | OPACITY | disabled .38, muted .6, backdrop .5 |
| `state` | State layers | FLOAT | OPACITY | hover .08, focus .12, pressed .12, dragged .16 |
| `stroke` | Border width | FLOAT | STROKE_FLOAT | none 0, sm 1, md 2, lg 4 |
| `z` | Z-index | FLOAT | (default) | dropdown 1000, sticky 1100, overlay 1300, modal 1400, popover 1500, toast 1700, tooltip 1800 |
| `focus` | Focus ring | FLOAT | (default) | width 2, offset 2 |
| `icon` | Icon size | FLOAT | WIDTH_HEIGHT | xs 12, sm 16, md 20, lg 24, xl 32, 2xl 40 |

Rationale: Figma has no easing/cubic-bezier variable type → easing stored as a STRING
holding the CSS `cubic-bezier()` (standard token-pipeline move). Z-index and focus
aren't bindable in Figma but carry documentation/handoff value.

`generateSystem` gains a loop over `SYSTEM_TOKEN_GROUPS` after the existing
spacing/radii/elevation writes: find-or-create each `${prefix}/${name}` variable of
`group.type`, `setValueForMode`, and set `scopes` when non-empty. Progress `total`
grows by Σ group token counts.

### 2. One-click "Generate entire system" (`types.ts`, `code.ts`, `ui.tsx`)

New message:

```ts
export interface GenerateAllPayload {
  colors: GenerateColorsPayload;
  typography: GenerateTypographyPayload;
  system: GenerateSystemPayload;
  layout: GenerateLayoutPayload;
  includeDocsPage: boolean;
}
// UiMessage add: | { type: 'generate-all'; payload: GenerateAllPayload }
```

Each existing generator gains an optional `silent` flag that suppresses only its final
`done` post + `figma.notify` (progress posts still fire, keeping the UI busy state).
`generateAll` runs `generateColors → generateTypography → generateSystem →
generateLayout` (all `silent`), then `generateDocsPage` if requested, then posts one
combined `done` + notify. Reuses existing functions; no duplicated logic.

UI: footer gains a secondary **Generate entire system** button beside the per-tab
primary, plus a **Docs page** checkbox. `handleGenerateAll` bundles current
colors/typography/system/layout state into `GenerateAllPayload`.

### 3. On-canvas documentation page (`code.ts`)

`generateDocsPage(payload)` — after `figma.loadAllPagesAsync()`, find-or-create a
`PAGE` named **"Design System"**; remove any prior root frame it made (named
`Design System Reference`) so re-runs never duplicate; draw a vertical auto-layout
reference frame from the **in-memory payload data** (not read back from variables —
simpler, no alias resolution). Sections:

- Title + generated-on caption.
- **Colors** — per family: name label + 11 swatch rects (recompute via `generateScale`).
- **Semantic tokens** — Light/Dark swatch pairs from `resolveSemanticTokens` + scales.
- **Type** — one specimen line per style at its resolved size (fonts loaded with a
  cross-family fallback `Inter → Roboto → Arial`).
- **Spacing / Radii / Elevation** — simple visual rows from the existing data.
- **New layers** — generic `prefix/name = value` rows from `SYSTEM_TOKEN_GROUPS`.

Helper node factories (`textNode`, `swatch`, `vstack`, `hstack`) keep it readable.
Defensive: font load wrapped in try/catch; empty inputs guarded.

### 4. UI preview (`ui.tsx`, `ui.css`)

`SystemTab` renders the new layers generically below the existing spacing/radii/
elevation preview: one section per `SYSTEM_TOKEN_GROUPS` entry (`label` heading + value
chips). `systemVarCount` and the footer note include the new variable counts. No new
tab.

### 5. Tests (`utils.test.ts`)

- `SYSTEM_TOKEN_GROUPS`: expected prefixes present; every variable name unique across
  all groups; easing values match `/^cubic-bezier\(/`; duration values ascending.

### Files touched (Phase 1)

`src/utils.ts` (new groups), `src/types.ts` (`GenerateAllPayload` + message),
`src/code.ts` (`silent` flag, group loop in `generateSystem`, `generateAll`,
`generateDocsPage`), `src/ui.tsx` (preview sections, generate-all button, docs
checkbox), `src/ui.css` (new preview + footer styles), `src/utils.test.ts`,
`CLAUDE.md`.

---

## Phase 2 (spec only — not built this session)

### Component library (`Components` tab, `code.ts` component builders)

Generate Figma **component sets** wired to the Phase 1 variables (fills → semantic
color tokens, padding/gap → `space/*`, corner → `radius/*`, border → `stroke/*`, text →
Text Styles, icon boxes → `icon/*`). Built with auto-layout and variant properties.

Starter set (atomic order):

- **Atoms:** Button (variant primary/secondary/ghost/danger × size sm/md/lg × state
  default/disabled), Input, Textarea, Checkbox, Radio, Switch, Badge, Avatar, Tag.
- **Molecules:** Select, Form field (label + control + help/error), Alert/Banner,
  Card, Tooltip.

Each component is find-or-updated by name. Variant matrices expressed as component-set
properties. Variable binding via `setBoundVariable`/`setBoundVariableForPaint`.

**Risks (Phase 2):** the Figma component/auto-layout/variable-binding API is verbose
and easy to get subtly wrong; component state (hover/pressed) can only be shown as
variants, not live; re-run identity across variant matrices needs care. Deferred so
Phase 1 ships cleanly.

## Constraints (unchanged, must hold)

- Two isolated contexts over `postMessage`; `src/utils.ts` stays pure (no DOM, no
  `figma`); async Variables/Text-Styles APIs (`documentAccess: dynamic-page`);
  UI uses only `var(--figma-color-*)`; find-or-update by name, never duplicate.

## Verification

`npm run typecheck && npm run lint && npm test && npm run build`, then manual load in
Figma: System tab shows the new layers; "Generate entire system" writes all
collections + Text Styles and creates the "Design System" doc page; re-run updates in
place (no duplicates).
