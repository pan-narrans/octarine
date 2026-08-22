# Visual Development Workflow

This is mandatory for frontend and UI work in Octarine. Source changes alone are not evidence that a visual requirement is complete. The rendered application is the authority.

## Working loop

Use this closed loop for every visual task:

`inspect → diagnose → modify → render → compare → iterate → verify`

1. Understand the request, inspect the implementation, and identify the relevant DOM/component and CSS rules.
2. Turn each numbered visual request (for example, V1 and V2) into an independent acceptance criterion. For unnumbered requests, derive criteria using existing design relationships and tokens rather than demanding pixel values.
3. Capture the current rendered state when useful, especially before a significant change.
4. Diagnose the real cause before editing. Inspect computed styles and layout; gaps can come from margin, padding, `gap`, line-height, wrappers, flex/grid sizing, pseudo-elements, inherited styles, or positioning.
5. Make the smallest change that addresses the cause. Preserve nearby structure and behavior; do not refactor, rename, or restyle unrelated UI.
6. Render the application, inspect the resulting screen, and compare each criterion with the reference or intended relationship. Iterate on concrete discrepancies.
7. Check nearby and responsive UI for regressions, then report each criterion as verified or unverified and state remaining uncertainty.

Do not stop because TypeScript compiles. Stop to ask for direction only when the remaining discrepancy is a consequential or genuinely subjective design decision. Do not endlessly tune differences that are not meaningful.

## Octarine implementation and inspection

- The client is React 18 + TypeScript, served by Vite; UI styles currently live in `src/styles.css` and component markup in `src/`.
- Start the web client with `npm run dev`. Vite uses `http://127.0.0.1:1420/` (strict port).
- The Tauri desktop shell can be started with `npx tauri dev` when native behavior must also be validated.
- The standalone Vite page does not provide real Tauri IPC. Use the development-only visual fixtures to render deterministic native-backed states in a browser: `?visual=dashboard`, `?visual=calendar`, `?visual=task-modal`, or `?visual=empty`. Fixtures are in-memory, activate only in Vite development mode, and must never be treated as proof of Rust/native behavior.
- Use the Codex in-app browser for visual verification. It supports screenshots, DOM snapshots, selectors, read-only computed-style/layout inspection, and explicit viewport overrides for responsive checks. Prefer it before adding standalone browser tooling.
- Capture a baseline screenshot for significant UI work and an after screenshot when it materially helps comparison. Keep screenshots as task evidence unless the task asks to retain artifacts in the repository.
- This repository has no committed Playwright, Cypress, or Storybook setup. Add browser-test dependencies only when the existing browser workflow cannot reliably verify the task, and ask before a broad tooling or architectural change.

Use the existing quality gate where relevant:

```bash
npm run ipc:check
npm run format:check
npm run lint
npm run build
```

## Design-system rules

Read `docs/DESIGN.md` before visual changes. Prefer, in order: existing CSS variables; existing components and styles; established CSS conventions; then a small reusable token addition when a new convention has actually been adopted. Do not introduce Tailwind or a replacement styling system merely for convenience.

Use relative design reasoning: match the standard small/medium spacing, align with neighboring controls, or use the existing visual hierarchy. Measure rendered pixels only when helpful to diagnose or compare.

Update `docs/DESIGN.md` once a visual convention becomes an accepted, reusable project decision. Do not add speculative rules.

## Design and Figma synchronization

Use design mode for substantial new interfaces, redesigns, ambiguous hierarchy, or requested design exploration. Establish an editable reference before heavily implementing. Once a direction is approved, switch to implementation mode and reproduce it faithfully; substantial deviations need user direction.

Figma is the editable source of visual intent when connected; the browser-rendered app proves implementation. For intentional visual changes made in code outside Figma, update the matching Figma reference after the final implementation is rendered and accepted. Do not sync intermediate CSS experiments. No Figma update is needed for implementation-only changes that do not alter intended appearance.

Track meaningful work with one of these states when useful:

- **SYNCED** — approved design and verified implementation match.
- **DESIGN AHEAD** — approved design is not yet implemented.
- **CODE AHEAD** — verified intentional UI change is not yet reflected in Figma.
- **DIVERGED** — the two differ and the current approved intent is unclear.

Never overwrite newer approved design intent with older code merely to claim synchronization. Ask the user when authority is materially ambiguous.

Figma is connected, and the editable Octarine draft is `https://www.figma.com/design/ZgrOPUU1kN7joGK2PdQhYz/Octarine`. Use that file for substantial design work and synchronization. If access fails in a future environment, report the connection limitation instead of pretending the reference is synchronized.

If the Figma MCP quota prevents writes, use the local development plugin in `tools/figma-octarine/`. Import its `manifest.json` through Figma Desktop's **Plugins → Development → Import plugin from manifest…** menu, then run **Octarine Local Design Bridge**. The local Plugin API avoids MCP calls but remains subject to the file's Figma plan limits.

## Completion report

For a visual task, finish concisely with the status of each criterion, a nearby regression check, and Figma sync state. Example:

- V1 — verified
- V2 — verified
- Nearby regression check — passed
- Figma — CODE AHEAD (not connected)

If the app cannot be rendered or inspected, state the missing capability, why verification is blocked, and the recommended remedy. Never imply visual verification occurred when it did not.
