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
- The standalone Vite page does not provide real Tauri IPC. Use the development-only visual fixtures to render deterministic native-backed states in a browser: `?visual=dashboard`, `?visual=calendar`, `?visual=task-modal`, `?visual=kanban`, `?visual=settings`, or `?visual=empty`. Fixtures are in-memory, activate only in Vite development mode, and must never be treated as proof of Rust/native behavior.
- Use the Codex in-app browser for visual verification. It supports screenshots, DOM snapshots, selectors, read-only computed-style/layout inspection, and explicit viewport overrides for responsive checks. Prefer it before adding standalone browser tooling.
- Capture a baseline screenshot for significant UI work and an after screenshot when it materially helps comparison. Keep screenshots as task evidence unless the task asks to retain artifacts in the repository.
- Storybook is committed for component-state review, and Playwright provides task-modal screenshot regression coverage. Cypress is not configured; add browser-test dependencies only when the documented manual review and existing automated coverage cannot reliably verify the task.

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

## Design and implementation synchronization

Octarine uses this workflow for visual interface changes:

`Storybook implementation → exact approval → app integration`

The shared React component and design tokens are the canonical implementation. Storybook is the source of truth for its implemented visual states and viewports. The rendered app is the authority for integration, surrounding layout, native context, and end-to-end behavior.

OpenPencil is not part of the active workflow. The existing `design/octarine.fig` file is retained as an archived historical artifact and must not be used as a design authority, implementation input, or review gate.

Storybook and the app normally render the same React component code. “Transfer from Storybook to the app” therefore means implementing the shared component once, verifying it in Storybook first, and then verifying that same implementation in the app. Do not create a separate Storybook-only copy merely to simulate promotion between stages.

This workflow applies to visual layout, styling, hierarchy, component, and responsive changes. Nonvisual logic fixes do not require Storybook review unless they materially change visible states. Skip the design gate for a visual change only when the user explicitly requests it.

Track visual work with these states:

- **STORYBOOK REVIEW** — the shared implementation is awaiting exact visual approval.
- **STORYBOOK APPROVED** — Storybook is the accepted component design; app verification is pending.
- **APP VERIFIED** — the approved component works in app context.
- **CURRENT** — Storybook is approved and the app is verified.

Storybook approval is exact: it establishes the implemented design baseline and authorizes visual snapshot updates. Record it in the task handoff.

Prefer one responsive flex source with breakpoint annotations over separate desktop, tablet, and mobile copies. Create separate frames only for genuinely different UI states. Reusable component masters and tokens must match the elements used in composed screens.

Do not use the Figma local development plugin for new visual work. Storybook is available through `npm run storybook`; use named stories to review the actual React component states. The existing Figma bridge remains historical until its removal is approved separately.

### Storybook → app loop

For each visual request:

1. Inspect the current Storybook states and app context. Identify the affected states and breakpoints.
2. Implement the real shared component and named Storybook stories. For an existing app component, use a temporary non-default proposed variant when necessary so the app retains its current design during review.
3. Render every affected Storybook state and viewport. Iterate there on implementation-level differences.
4. Pause for explicit Storybook approval, then update the approved visual baselines.
5. Integrate the same shared component into the app. Remove superseded variants and styles, then verify layout, scrolling, focus, keyboard behavior, and nearby responsive UI.
6. Run the applicable quality gates and report **CURRENT** only when Storybook and app verification agree.

Story coverage must name every reviewable state and affected breakpoint. Use Storybook's named viewport states instead of relying on an operator to resize the browser consistently. Stories must render the real shared component, never a permanent Storybook-only copy.

### Automated visual regression

Task-modal and task-card stories are covered by screenshot baselines in `tests/visual/`. Run `npm run visual:test` to compare their approved component states and viewports. The command starts Storybook when it is not already running.

Use `npm run visual:update` only after an intentional visual review; it replaces the approved baselines. Review the generated image changes alongside the component and design-reference changes. Screenshot tests complement, rather than replace, rendered in-app inspection.

## Completion report

For a visual task, finish concisely with the status of each criterion, a nearby regression check, and design sync state. Example:

- V1 — verified
- V2 — verified
- Nearby regression check — passed
- Automated visual baseline — passed
- Storybook — APPROVED
- App — VERIFIED

If the app cannot be rendered or inspected, state the missing capability, why verification is blocked, and the recommended remedy. Never imply visual verification occurred when it did not.
