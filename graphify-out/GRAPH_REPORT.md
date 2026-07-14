# Graph Report - .  (2026-07-15)

## Corpus Check
- Corpus is ~21,620 words - fits in a single context window. You may not need a graph.

## Summary
- 284 nodes · 516 edges · 20 communities (19 shown, 1 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.84)
- Token cost: 94,352 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Sandbox Generators & Writers|Sandbox Generators & Writers]]
- [[_COMMUNITY_Design System Concepts & Docs|Design System Concepts & Docs]]
- [[_COMMUNITY_NPM Dependencies|NPM Dependencies]]
- [[_COMMUNITY_React UI App & Tabs|React UI App & Tabs]]
- [[_COMMUNITY_Utils Types & Color Models|Utils Types & Color Models]]
- [[_COMMUNITY_Component Builders|Component Builders]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Component Metadata & Token Scales|Component Metadata & Token Scales]]
- [[_COMMUNITY_Plugin Manifest|Plugin Manifest]]
- [[_COMMUNITY_Color Conversion Functions|Color Conversion Functions]]
- [[_COMMUNITY_DTCG Export Helpers|DTCG Export Helpers]]
- [[_COMMUNITY_Input Config Types|Input Config Types]]
- [[_COMMUNITY_Main Sync Script|Main Sync Script]]
- [[_COMMUNITY_Semantic Token Types|Semantic Token Types]]
- [[_COMMUNITY_OKLCH  sRGB Conversion|OKLCH / sRGB Conversion]]
- [[_COMMUNITY_HSL  HSV Conversion|HSL / HSV Conversion]]

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 17 edges
2. `fillPaint()` - 16 edges
3. `radius()` - 15 edges
4. `makeTextNode()` - 14 edges
5. `pad()` - 12 edges
6. `generateScale()` - 11 edges
7. `buildDtcgTokens()` - 11 edges
8. `generateSystem()` - 10 edges
9. `strokeWidth()` - 10 edges
10. `Design System Token Generator (Figma plugin)` - 10 edges

## Surprising Connections (you probably didn't know these)
- `warn-figma-dynamic-page-sync hookify rule` --conceptually_related_to--> `Design System Token Generator (Figma plugin)`  [INFERRED]
  .claude/hookify.warn-figma-dynamic-page-sync.local.md → CLAUDE.md
- `Pivot to unified merged design-system approach` --conceptually_related_to--> `Design System Token Generator (Figma plugin)`  [INFERRED]
  .remember/archive.md → CLAUDE.md
- `warn-figma-dynamic-page-sync hookify rule` --references--> `Sandbox context (src/code.ts)`  [INFERRED]
  .claude/hookify.warn-figma-dynamic-page-sync.local.md → CLAUDE.md
- `Modern two-column Figma-native UI` --references--> `UI iframe context (src/ui.tsx)`  [INFERRED]
  docs/superpowers/specs/2026-07-06-token-generator-redesign-design.md → CLAUDE.md
- `SEMANTIC_TOKENS layered token map` --references--> `Semantic tokens (Tokens collection, Light/Dark modes)`  [INFERRED]
  docs/superpowers/specs/2026-07-06-token-generator-redesign-design.md → CLAUDE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Two-context postMessage plugin architecture** — claude_sandbox_context, claude_ui_iframe_context, claude_types_message_contracts, claude_utils_shared_math [EXTRACTED 1.00]
- **One-click generate-entire-system flow** — claude_generate_all, claude_generate_system, claude_generate_docs_page, claude_semantic_tokens [EXTRACTED 0.90]
- **Role-based semantic token resolution** — claude_role_model, claude_resolve_semantic_tokens, claude_semantic_tokens, claude_color_primitives [EXTRACTED 0.90]

## Communities (20 total, 1 thin omitted)

### Community 0 - "Sandbox Generators & Writers"
Cohesion: 0.07
Nodes (52): AutoLayoutNode, buildVarIndex(), CORNER_FIELDS, ensureModes(), extractTextStyle(), FALLBACK_HEX, fallbackHex(), findOrCreateCollection() (+44 more)

### Community 1 - "Design System Concepts & Docs"
Cohesion: 0.07
Nodes (36): warn-figma-dynamic-page-sync hookify rule, Build Plugin CI pipeline, Pivot to unified merged design-system approach, appendChild cross-page-reparent bug, Color primitives (Primitives collection, 11-step ramps), Component library (COMPONENT_LIBRARY + builders), Design System Token Generator (Figma plugin), Export JSON (buildDtcgTokens, W3C DTCG) (+28 more)

### Community 2 - "NPM Dependencies"
Cohesion: 0.06
Nodes (34): dependencies, react, react-dom, description, devDependencies, eslint, @eslint/js, eslint-plugin-react (+26 more)

### Community 3 - "React UI App & Tabs"
Cohesion: 0.07
Nodes (16): container, App(), COLOR_ROLES, DEFAULT_FAMILIES, FONT_FALLBACK, LAYOUT_FIELDS, SCALE_RATIOS, seedStyles() (+8 more)

### Community 4 - "Utils Types & Color Models"
Cohesion: 0.07
Nodes (25): AvatarSize, ButtonSize, CHROMA_SCALE, ComponentInfo, DEFAULT_STYLE_SEED, DtcgTree, ElevationLevel, HSL (+17 more)

### Community 5 - "Component Builders"
Cohesion: 0.31
Nodes (21): buildAlert(), buildAvatar(), buildBadge(), buildButton(), buildCard(), buildCheckbox(), buildFormField(), buildInput() (+13 more)

### Community 6 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, jsx, lib, module, moduleResolution (+10 more)

### Community 7 - "Component Metadata & Token Scales"
Cohesion: 0.14
Nodes (13): alertAccentToken(), badgeFillToken(), badgeTextToken(), buttonFillToken(), buttonTextToken(), COMPONENT_KEYS, COMPONENT_LIBRARY, DEFAULT_LAYOUT_MODES (+5 more)

### Community 8 - "Plugin Manifest"
Cohesion: 0.20
Nodes (9): api, documentAccess, editorType, id, main, name, networkAccess, allowedDomains (+1 more)

### Community 9 - "Color Conversion Functions"
Cohesion: 0.20
Nodes (10): RGB01, safeScale(), generateScale(), hexToRgb(), hexWithAlpha(), rgbToHex(), rgbToHsl(), rgbToHsv() (+2 more)

### Community 10 - "DTCG Export Helpers"
Cohesion: 0.40
Nodes (6): buildDtcgTokens(), dim(), parseCubicBezier(), setNested(), systemGroupType(), systemGroupValue()

### Community 11 - "Input Config Types"
Cohesion: 0.50
Nodes (4): ColorFamilyInput, ColorSpace, TypeStyle, DtcgInput

### Community 13 - "Semantic Token Types"
Cohesion: 0.67
Nodes (3): ColorRole, SemanticResolution, SemanticTokenSpec

### Community 14 - "OKLCH / sRGB Conversion"
Cohesion: 0.67
Nodes (3): clamp255(), linearToSrgb(), oklchToRgb()

### Community 15 - "HSL / HSV Conversion"
Cohesion: 0.67
Nodes (3): hslToRgb(), hsvToRgb(), hueSegment()

## Knowledge Gaps
- **106 isolated node(s):** `name`, `id`, `api`, `main`, `ui` (+101 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `generateScale()` connect `Color Conversion Functions` to `Sandbox Generators & Writers`, `DTCG Export Helpers`, `React UI App & Tabs`, `Utils Types & Color Models`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `name`, `id`, `api` to the rest of the system?**
  _109 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Sandbox Generators & Writers` be split into smaller, more focused modules?**
  _Cohesion score 0.07127882599580712 - nodes in this community are weakly interconnected._
- **Should `Design System Concepts & Docs` be split into smaller, more focused modules?**
  _Cohesion score 0.07301587301587302 - nodes in this community are weakly interconnected._
- **Should `NPM Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05714285714285714 - nodes in this community are weakly interconnected._
- **Should `React UI App & Tabs` be split into smaller, more focused modules?**
  _Cohesion score 0.06881720430107527 - nodes in this community are weakly interconnected._
- **Should `Utils Types & Color Models` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._