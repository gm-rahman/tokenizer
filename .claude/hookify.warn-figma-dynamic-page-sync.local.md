---
name: warn-figma-dynamic-page-sync
enabled: true
event: file
pattern: 'figma\.currentPage\s*=[^=]|figma\.(getLocalTextStyles|getLocalEffectStyles|getLocalVariableCollections|getVariableById|getNodeById|getStyleById)\('
action: warn
---

⚠️ **Synchronous document-access API under `documentAccess: dynamic-page`**

This plugin's `manifest.json` sets `documentAccess: "dynamic-page"`, so the
synchronous document APIs throw at runtime. Use the async variants:

- `figma.currentPage = page`  →  `await figma.setCurrentPageAsync(page)`
- `figma.getLocalTextStyles()`  →  `await figma.getLocalTextStylesAsync()`
- `figma.getLocalEffectStyles()`  →  `await figma.getLocalEffectStylesAsync()`
- `figma.getLocalVariableCollections()`  →  `await figma.getLocalVariableCollectionsAsync()`
- `figma.getVariableById(id)`  →  `await figma.variables.getVariableByIdAsync(id)`
- `figma.getNodeById(id)`  →  `await figma.getNodeByIdAsync(id)`
- `figma.getStyleById(id)`  →  `await figma.getStyleByIdAsync(id)`

Reading `figma.currentPage` (getter) is fine — only the setter and the sync
accessors are banned. This exact bug hit the session on 2026-07-14:
"in set_currentPage: Cannot call with documentAccess: dynamic-page."
