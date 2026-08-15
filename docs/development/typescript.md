# TypeScript and React Development Guide

This guide distinguishes current expectations from gates that become required after the frontend tooling baseline.

## Quality Gates

The current required frontend command is:

```bash
npm run build
```

The focused tooling change will configure and make these commands green before they become required:

```bash
npm run format:check
npm run lint
npm run build
```

Frontend tests become a required gate with the first meaningful Vitest and React Testing Library suite; do not add an empty test command merely to claim coverage.

## Naming

- React component files and exported components: `PascalCase`, such as `TaskCard.tsx` and `TaskCard`.
- Hooks, utilities, and non-component modules: kebab-case filenames.
- Hooks, functions, and variables: `camelCase`.
- Types and interfaces: `PascalCase`; do not prefix interfaces with `I`.
- Constants with application-wide fixed values may use `SCREAMING_SNAKE_CASE`.

## Type Safety

- Keep strict TypeScript compilation enabled.
- Do not introduce new explicit `any`.
- Use `unknown` for genuinely untrusted input and narrow it before use.
- Existing `any` is technical debt to remove incrementally.
- Require explicit return types for exported utilities, hooks, store actions, and IPC adapters.
- Allow inferred returns for small local functions and callbacks.
- Rust-owned generated DTOs are the target IPC contract; generated files are not edited manually.

## React and State

- Use functional components with typed props.
- Keep component-local state local.
- Use Zustand for state shared across features or distant components, not every state value.
- New substantial feature logic must not be added to the existing monolithic `App.tsx`; extract an owned feature boundary.
- Do not turn an unrelated change into a wholesale frontend rewrite.

Target organization:

```text
src/
├── app/
├── features/
│   ├── tasks/
│   ├── calendar/
│   ├── notes/
│   ├── journals/
│   └── settings/
└── shared/
    ├── components/
    ├── hooks/
    ├── ipc/
    └── types/
```

Feature-specific code stays with its feature. Shared code should have at least two genuine consumers. Raw Tauri `invoke` calls belong in typed IPC adapter modules.

## Testing

When the frontend test layer is introduced:

- Start with pure feature logic and IPC adapters.
- Mock at the typed IPC boundary.
- Use component tests for important user-visible states.
- Add regression tests for corrected behavior where practical.
