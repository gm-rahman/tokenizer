# CLAUDE.md

Guidance for Claude Code sessions working in this repository.

## Overview

This repo is a **Figma plugin: Design System Token Generator**. It automates the
creation of a design system's foundations directly inside a Figma file:

- **Color primitives** — 11-step ramps (`50…950`) per family, written as `COLOR`
  variables in a `Primitives` variable collection (via the **Variables API**).
- **Semantic tokens** — a `Tokens` collection with **Light** and **Dark** modes.
  A layered set (Radix/Stripe style: `bg/*`, `text/*`, `border/*`, `action/*`,
  `success`/`warning`/`danger`) where each token is a `VariableAlias` per mode.
  Tokens resolve by the family's explicit **role**, not by name — each family
  carries a `role` (`neutral`/`primary`/`secondary`/`success`/`warning`/`danger`/
  `none`); `neutral` + `primary` are required, the rest skip-and-report when
  unassigned. Resolution logic is pure in `utils.ts` (`resolveSemanticTokens`).
- **Typographic hierarchy** — an **editable** list of Text Styles (seeded from
  `defaultTypeStyles`: Display, Heading 1–4, Body, Caption, Label). Each style can
  emit several weights as separate styles (`Body` → `Body/Regular`, `Body/Bold`),
  optionally with a per-style font. All scale math runs in the UI; the sandbox
  writes the resolved values via the **Text Styles API**.
- **Universal foundation tokens** — a `Design System` collection (`Base` mode)
  with spacing, radii, and elevation, plus the extended layers modeled as pure
  data in `SYSTEM_TOKEN_GROUPS`: motion (`duration/*` FLOAT, `easing/*` STRING
  `cubic-bezier`), `opacity/*` + `state/*` (OPACITY scope), `stroke/*` border
  widths, `z/*`, `focus/*`, and `icon/*`. Written by `generateSystem`.
- **Layout & breakpoints** — a `Layout & Breakpoints` collection, one mode per
  breakpoint, Number vars for grid width/columns/margin/gutter.
- **One-click "Generate entire system"** — `generate-all` runs every generator in
  sequence (each supports a `silent` flag) and then `generateDocsPage` draws an
  on-canvas **"Design System"** documentation page from the in-memory payload
  (find-or-replaces its own `Design System Reference` frame).
- **Convert** — local Text Styles → a `Typography Variables` collection.

- **Component library** — a `Components` tab builds starter Figma component sets
  on a `Components` page, wired to the variables above (fills → semantic color
  tokens, padding/gap → `space/*`, corner → `radius/*`, border → `stroke/*`), with
  a literal-value fallback when a token is absent. Metadata is pure data in
  `COMPONENT_LIBRARY`; builders live in `code.ts` (`buildButton`, `buildBadge`,
  `buildInput`, `buildTextarea`, `buildSelect`, `buildCard`, `buildCheckbox`,
  `buildRadio`, `buildSwitch`, `buildAlert`, `buildAvatar`, `buildTooltip`,
  `buildTag`, `buildFormField` — the Tooltip uses the `bg/inverse`/`text/inverse`
  tokens; the Form field composes an inline control, not an Input instance), each
  defensive so one failure never aborts the pass. Re-run replaces the
  `Component Library` board.

The plugin UI is a Figma-native React app with **Typography / Colors / System /
Layout / Components / Convert** tabs in a two-column layout (controls left, live
preview right). The sandbox posts the installed font list
(`figma.listAvailableFontsAsync`) so the UI can offer font dropdowns.

The starter component set from the spec is now complete (14 components). See
`docs/superpowers/specs/2026-07-14-whole-design-system-design.md`.

## Commands

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies (no lockfile is committed; CI uses `npm install`, not `npm ci`). |
| `npm run build` | Full build — runs `build:code` then `build:ui`. |
| `npm run build:code` | Bundle `src/code.ts` → single IIFE `dist/code.js` (sandbox). |
| `npm run build:ui` | Bundle + inline the React app → self-contained `dist/ui.html`. |
| `npm run dev:code` | Rebuild the sandbox bundle on change (`vite build --watch`). |
| `npm run dev:ui` | Rebuild the UI bundle on change (`vite build --watch`). |
| `npm run typecheck` | `tsc --noEmit` across the whole project. |
| `npm run lint` | ESLint (flat config, TypeScript + React). |
| `npm test` | Vitest (`vitest run`) — unit tests for the pure `utils.ts` logic. |

Always `npm run build` before loading the plugin in Figma — the manifest points at
`dist/`, which is git-ignored.

## Architecture

A Figma plugin runs in **two isolated contexts** that communicate only over
`postMessage`:

- **Sandbox** — `src/code.ts`. Has the `figma` API, no DOM. Bundled to a single
  IIFE `dist/code.js` by `vite.config.code.ts`.
- **UI iframe** — `src/ui.tsx` (mounted by `src/main.tsx`). Standard web/React,
  **no** `figma` API. Bundled and inlined to a single `dist/ui.html` by
  `vite.config.ui.ts` (`vite-plugin-singlefile`, then renamed `index.html` →
  `ui.html`).

Because the two targets differ, there are **two Vite builds** orchestrated by npm
scripts.

Message passing uses the typed `UiMessage` (UI → sandbox) and `PluginMessage`
(sandbox → UI) contracts defined in `src/types.ts`. The sandbox posts `progress`
updates during generation so long runs don't freeze the UI, and uses
`figma.notify` for final feedback.

Pure, shared math lives in `src/utils.ts` — color conversions
(hex/RGB/HSL/HSB/OKLCH), `generateScale`, and `buildTypeScale`. It is imported by
**both** contexts, so it must stay dependency-free and must never touch the DOM or
the `figma` global.

### File map

```
manifest.json            main=dist/code.js, ui=dist/ui.html, documentAccess=dynamic-page
vite.config.code.ts      sandbox build (IIFE)
vite.config.ui.ts        UI build (single inlined HTML)
index.html               UI entry, mounts src/main.tsx
src/main.tsx             React mount
src/ui.tsx               tabs, inputs, palette/type preview, footer action
src/ui.css               Figma-native CSS using var(--figma-color-*)
src/code.ts              sandbox: Variables, Light/Dark modes, Text Styles
src/utils.ts             pure color + typography math (shared)
src/types.ts             UI <-> sandbox message contracts
.github/workflows/build.yml   typecheck + lint + build + upload artifact
```

## Conventions

- **Find-or-update, never duplicate.** Collections, variables, and text styles are
  looked up by name and reused; re-running the plugin updates values in place.
- **Async APIs are required.** Because `manifest.json` sets
  `documentAccess: "dynamic-page"`, use the async Variables / Text-Styles APIs
  (`getLocalVariableCollectionsAsync`, `getVariableByIdAsync`,
  `getLocalTextStylesAsync`, `loadFontAsync`, …).
- **UI styling** uses only `var(--figma-color-*)` variables so the plugin tracks
  the editor's light/dark theme. No hard-coded colors, no external fonts/CDNs.
- **Keep math in `utils.ts`** dependency-free so it runs in both contexts. Color
  conversions are hand-written (OKLCH via the Björn Ottosson matrices); do not add
  a color library.

## Loading in Figma

1. `npm install && npm run build`
2. Figma → **Plugins → Development → Import plugin from manifest…**
3. Select this repo's `manifest.json`.
4. Run the plugin; use the **Colors** and **Typography** tabs. Re-running updates
   existing variables/styles rather than creating duplicates.

## Git

- Develop on the `dev` branch. It holds everything, including dev-only artifacts
  (`plan/`, `.claude/`, `log.md`, `docs/`).
- `main` holds **only the shipped project files** — no planning/session artifacts.
  Don't merge `dev` into `main` directly; run `bash scripts/sync-to-main.sh` to
  copy just the necessary paths from `dev` onto `main` and push.
- Commits are authored as `Claude <noreply@anthropic.com>`.
