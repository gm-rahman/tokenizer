# Figma Plugin: Design System Token Generator — Implementation Plan

## Context
The `tokenizer` repo is greenfield (only a `LICENSE` file). We are building, from
scratch, a Figma plugin that automates creation of a design-system's color
primitives + semantic tokens (via the **Variables API**, with Light/Dark modes and
aliasing) and a typographic hierarchy (via the **Text Styles API**). The UI is a
Figma-native React app with Colors and Typography tabs. A GitHub Actions pipeline
type-checks, lints, builds, and packages the plugin as a downloadable artifact.

Decisions confirmed with the user:
- **Build:** custom Vite config (no create-figma-plugin toolkit).
- **Color math:** hand-written OKLCH/HSL/HSB conversions in `utils.ts` (no library).
- **Delivery:** commit & push to `claude/figma-token-generator-plugin-b5q5nv`; **no PR**.

## Architecture
A Figma plugin runs in two isolated contexts that talk over `postMessage`:
- **Sandbox** (`code.ts`) — has the `figma` API, no DOM. Bundled to a single IIFE `dist/code.js`.
- **UI iframe** (`ui.tsx`) — standard web/React, no `figma` API. Bundled + inlined to a single `dist/ui.html`.

Because the two targets differ, we use **two Vite builds** orchestrated by npm scripts.

### File layout
```
manifest.json                 # main=dist/code.js, ui=dist/ui.html, documentAccess=dynamic-page
package.json                  # scripts: build:code, build:ui, build, typecheck, lint
tsconfig.json
vite.config.ui.ts             # React + vite-plugin-singlefile -> dist/ui.html
vite.config.code.ts           # lib mode, IIFE -> dist/code.js
index.html                    # UI entry (mounts src/main.tsx)
eslint.config.js
.gitignore
src/
  main.tsx                    # React mount
  ui.tsx                      # tabs, inputs, per-level override list, footer action
  ui.css                      # Figma-native CSS using var(--figma-color-*)
  code.ts                     # sandbox: Variables, Light/Dark modes, Text Styles
  utils.ts                    # color conversions + palette + modular scale
  types.ts                    # shared message contracts (UI <-> sandbox)
.github/workflows/build.yml
```

## Color system (`utils.ts` + `code.ts`)
**`utils.ts` (pure, hand-written):**
- `hexToRgb` / `rgbToHex`; `rgb<->hsl`; `rgb<->hsv(hsb)`.
- `rgb<->oklch` via linear-sRGB → OKLab → OKLCH (Björn Ottosson matrices), with sRGB
  gamut clamping so generated steps stay renderable.
- `generateScale(baseHex, space)` → 11 steps keyed `50,100,200…900,950`. A fixed
  perceptual **lightness ramp** is applied per step (lightest→darkest), keeping
  hue/chroma (OKLCH) or hue/saturation (HSL/HSB) from the base and easing chroma at
  the extremes to avoid clipping. OKLCH is the recommended/default space.

**`code.ts` — Primitives collection:**
- Find-or-create Variable Collection `Primitives` (`getLocalVariableCollectionsAsync`).
- For each family/step, find-or-create a `COLOR` variable named `family/step`
  (e.g. `blue/500`) and `setValueForMode` with RGBA (0–1). Update in place if it exists.

**`code.ts` — Tokens collection (Light/Dark + aliasing):**
- Find-or-create collection `Tokens`; rename the default mode to `Light`, add a `Dark` mode.
- Create/update the required semantic tokens as `COLOR` variables whose value in each
  mode is a **VariableAlias** to the matching primitive:
  - `bg/primary|secondary|tertiary`, `text/primary|secondary|muted|inverse`,
    `border/default|focus|error`, `action/primary/default|hover`.
  - Light maps to light primitives (e.g. `bg/primary`→`slate/50`, `text/primary`→`slate/900`);
    Dark inverts (`bg/primary`→`slate/950`, `text/primary`→`slate/50`). Mapping table lives in `code.ts`.

## Typography system (`utils.ts` + `code.ts`)
- `utils.ts`: `buildTypeScale(baseSize, ratio, manualMultiplier)` producing font size,
  line-height, letter-spacing, weight per level using modular-scale math + category rules
  (tight LH ~110–120% / negative tracking for Display+Headings; relaxed LH ~140–160% /
  neutral tracking for Body; uppercase + wide tracking for `Label`).
- Levels: `Display`, `Heading 1…6`, `Body / Base`, `Body / Strong`, `Callout`,
  `Caption`, `Label`.
- `code.ts`: for each level `loadFontAsync`, find-or-create a Text Style by name
  (`getLocalTextStylesAsync`), and set `fontName/fontSize/lineHeight/letterSpacing`.
  User overrides from the UI win over computed values.

## UI (`ui.tsx` + `ui.css`)
- **Sticky header:** segmented control (Colors / Typography).
- **Colors tab:** base color hex input(s), color-space toggle (HSL/HSB/OKLCH),
  live 11-step palette preview, "generate semantic tokens" checkbox, Light/Dark mapping preview.
- **Typography tab:** font family, base size (default 16), scale dropdown (Major Third
  1.250, Perfect Fourth 1.333, etc.), manual multiplier, and a per-level list to override
  size/weight/line-height/letter-spacing before generating.
- **Sticky footer:** full-width primary action ("Generate Variables" / "Generate Typography").
- **Styling:** Figma CSS vars (`--figma-color-bg`, `--figma-color-text`,
  `--figma-color-border`, `--figma-color-bg-brand`), Inter 11–12px, focus rings via
  `--figma-color-border-brand-strong`, hover states, and a success/loading toast on generate.
- Messaging via `types.ts` contracts; sandbox posts progress so generation is batched
  (awaited sequentially) without freezing the UI, and uses `figma.notify` for feedback.

## Manifest & config
- `manifest.json`: `api: "1.0.0"`, `main: dist/code.js`, `ui: dist/ui.html`,
  `editorType: ["figma"]`, `documentAccess: "dynamic-page"` (so we use the async Variables/
  Styles APIs), `networkAccess: { allowedDomains: ["none"] }`.
- `tsconfig.json`: strict, with `@figma/plugin-typings`.
- `eslint.config.js`: flat config, TS + React.

## CI/CD (`.github/workflows/build.yml`)
Triggers: `push` and `pull_request` on `main`. Steps: checkout → setup-node →
`npm install` → `tsc --noEmit` → `eslint` → `vite build` (both configs) → zip `dist/` +
`manifest.json` → `actions/upload-artifact`.

## Verification
- `npm install && npm run typecheck && npm run lint && npm run build` succeeds; `dist/`
  contains `code.js` and self-contained `ui.html`.
- Manually load in Figma (Plugins → Development → Import from manifest): Colors tab
  generates the `Primitives` collection (11-step families) and `Tokens` collection with
  `Light`/`Dark` modes aliased correctly; re-running updates in place (no duplicates).
  Typography tab creates the text-style hierarchy; overrides are respected.
- Push the branch and confirm the Actions workflow goes green and uploads the artifact.

## Deliverables
Commit and push all of the above to `claude/figma-token-generator-plugin-b5q5nv`. No PR.
