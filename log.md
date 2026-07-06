# log.md — compact session log

Dense, token-cheap state record. Read this first. Append newest entries at top of LOG. Keep lines terse.

## STATE (current)
- Build: PASS. typecheck PASS, `npm run build` PASS (2026-07-06).
- dist/ = code.js (15.9kB) + ui.html (160kB, self-contained). Matches manifest (main=dist/code.js, ui=dist/ui.html). dist is git-ignored.
- node_modules installed. package-lock.json present (CLAUDE.md says CI uses `npm install`).
- Branch: main. Only commit c6479c8 "Initial commit". Working tree = untracked files (nothing committed yet beyond initial).

## FACTS (don't re-derive)
- Figma plugin, 2 isolated contexts over postMessage: sandbox `src/code.ts`→`dist/code.js` (IIFE, has `figma`, no DOM); UI `src/ui.tsx`/`main.tsx`→`dist/ui.html` (React, no `figma`).
- Two vite builds: vite.config.code.ts, vite.config.ui.ts. UI build emits index.html then a closeBundle rename step → ui.html (works, verified).
- Shared pure math: src/utils.ts (hex/RGB/HSL/HSB/OKLCH, generateScale, buildTypeScale). Must stay dep-free, no DOM, no figma. Imported by both contexts.
- Message contracts: src/types.ts — UiMessage (UI→sandbox), PluginMessage (sandbox→UI).
- Output: Primitives collection (COLOR vars, 11-step ramps 50..950); Tokens collection w/ Light+Dark modes (VariableAlias per mode); Text Styles (Display..Label, modular scale).
- Async Variables/TextStyles APIs required (documentAccess=dynamic-page).
- Find-or-update by name, never duplicate.

## HOW TO RUN (plugin can't run headless)
1. `npm run build`
2. Figma desktop → Plugins → Development → Import plugin from manifest… → pick manifest.json
3. Run plugin; Colors + Typography tabs. Re-run updates in place.
- Cannot be launched from CLI — needs Figma desktop app. No standalone/browser run.

## COMMANDS
- build: `npm run build` (build:code + build:ui) | typecheck: `npm run typecheck` | lint: `npm run lint`
- watch: `npm run dev:code` / `npm run dev:ui`

## REDESIGN (in brainstorming, not yet built) — decisions locked
- Layout: two-column (controls left ~340px | live preview right), sticky header tabs + footer action. Modern Figma-native: hairline borders, soft depth, one accent (Figma blue), tabular nums.
- Window height: cap at ≤70% viewport (real plugin: set showUI height accordingly, ~640).
- Typography tab: default font DROPDOWN (from figma.listAvailableFontsAsync, posted to UI) + per-style font override dropdown; editable style list (add/dupe/rename/delete); per-weight generation (weights[] → separate text styles Name/Weight); live specimen preview (renders face only if installed). Default set trimmed 12→8 (Display, Heading 1-4, Body, Caption, Label).
- Colors semantic tokens: LAYERED SEMANTIC (Radix/shadcn/Stripe style). Groups: Surface(bg/canvas,surface,subtle,muted) Content(text/primary,secondary,disabled,on-accent) Border(default,strong,focus) Action(primary,primary-hover,secondary) Feedback(success,warning,danger). Each = Light→Dark alias.
- ROLE MODEL (key): each color family carries an explicit `role` (neutral|primary|secondary|success|warning|danger|none). Semantic tokens reference ROLE+step, resolver maps role→family. NOT name/position based. Required: neutral+primary (else abort semantic w/ notify). Optional roles skip+report. action/secondary = secondary family if tagged else neutral fallback (same 200→800). Duplicate role → first wins. Default seed: slate=neutral, blue=primary, violet=secondary, green=success, amber=warning, red=danger. ColorFamilyInput gains `role`; utils `resolveSemanticTokens(families)→{plan,skipped,missingRequired}`.
- Color preview: 3 variations built in mockup (Ramps / Tokens dual-chip / Gallery) — user choosing which to ship.
- New msg: PluginMessage {type:'fonts',families:string[]}. types.ts: TypeStyle{id,name,step|null,fontSize,lineHeight,letterSpacing,textCase,weights[],font?}; GenerateTypographyPayload{fontFamily,styles[]}. Scale math moves to UI.
- Mockup artifact: https://claude.ai/code/artifact/259022a8-99b6-49e6-8060-27d437426871 (source in scratchpad/plugin-mockup.html)
- OPEN: which color preview variation to ship; vitest yes/no; then write spec + plan.

## LOG
- 2026-07-06: Git workflow: dev branch = everything; main = necessary files only (src, configs, manifest, .github, CLAUDE.md, .gitignore). Renamed branch claude/... → `dev`. Sync via `bash scripts/sync-to-main.sh` (copies necessary paths dev→main + push; never merge dev→main). Both pushed to origin (github.com:gm-rahman/tokenizer).
- 2026-07-06: BUILT the redesign. types.ts (TypeStyle, ColorRole+role, fonts msg). utils.ts: defaultTypeStyles/resolveStyleName/SEMANTIC_TOKENS/resolveSemanticTokens (+15 vitest tests, TDD, all green). code.ts: posts font list, showUI 760x640, weight-loop typography, role-based color pass w/ abort+skip notify. ui.tsx: full two-column rewrite (font dropdowns, editable styles w/ weight chips + per-style font + uppercase, live specimen; role-tagged families, Ramps+Tokens preview). ui.css: sleek Figma-native two-column. Verified: typecheck+test(15)+lint+build all pass. Added vitest dep + `npm test`. Old buildTypeScale/TYPE_LEVELS/TypeLevelOverride removed.
- 2026-07-06: UI window enlarged 380x640 → 760x820 (code.ts:13 showUI). Content capped max-width 680px + centered (.tab, .footer>* in ui.css) so wide window doesn't stretch forms. Rebuilt OK.
- 2026-07-06: Verified project ready — typecheck+build pass, dist correct. Created this log. Explained Figma import (no headless run possible).
