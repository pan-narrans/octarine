# Octarine Local Design Bridge

This development plugin runs inside Figma Desktop through the local Plugin API. It does not consume Figma MCP calls.

## Connect

1. Open the Octarine draft in Figma Desktop.
2. Choose **Plugins → Development → Import plugin from manifest…**.
3. Select `tools/figma-octarine/manifest.json`.
4. Run **Plugins → Development → Octarine Local Design Bridge**.
5. Confirm that the panel reports `Connected to Octarine`, three pages, and the existing variable count.
6. Choose **Build/update design**. The operation replaces only the exact generated wrappers named `Octarine / Generated Components` and `Octarine / Generated Views`, then creates the reusable component library and four editable fixture views.

Re-run the development plugin after its local files change. No build or dependency installation is required.
