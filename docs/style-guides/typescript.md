# TypeScript & React Style Guide

This document establishes the structural, naming, formatting, and type-safety guidelines for all TypeScript and React development within the Octarine frontend codebase (`src/`).

---

## 🚦 Linter & Formatting Standards

We enforce rigorous linting and formatting gates. All checks must pass without warnings during local development and CI pipelines.

1. **Linter:** **ESLint** (paired with `@typescript-eslint/eslint-plugin`).
   - Run command: `npm run lint`
   - *Policy:* The use of `eslint-disable` comments is prohibited. Any warning must be resolved explicitly.
2. **Formatter:** **Prettier**.
   - Run command: `npm run format`
   - *Policy:* Prettier standard formatting rules are applied automatically on save via editor settings or pre-commit hooks.

---

## 📝 Naming Conventions

We strictly follow standard modern JavaScript and React conventions:

| Item | Case Style | Example | Note |
| :--- | :--- | :--- | :--- |
| **Files & Directories** | `kebab-case` | `task-card.tsx`, `use-task-store.ts` | Lowercase only, separating words with hyphens. |
| **React Components** | `PascalCase` | `TaskCard`, `KanbanBoard` | Matching the filename (e.g., `task-card.tsx` exports `TaskCard`). |
| **Types / Interfaces** | `PascalCase` | `TaskPayload`, `ViewFilter` | Do not prefix interfaces with `I` (e.g., use `Task`, not `ITask`). |
| **Functions / Variables** | `camelCase` | `fetchTasks()`, `isCompleted` | Choose clear, action-oriented verbs for functions. |
| **Enums** | `PascalCase` | `TaskState`, `ColumnType` | Enum values must be SCREAMING_SNAKE_CASE or PascalCase. |

---

## 🛡️ Type Safety & Guard Policies

To maintain long-term robustness and scale seamlessly, we enforce complete, bulletproof type safety.

1. **Strict Type Declaration:**
   - **No `any`:** The use of `any` is strictly banned. Use concrete types, `unknown` (for unparsed API payloads), or generics.
   - **Explicit Returns:** All functions—especially API/Tauri adapters—must explicitly declare their return types.
2. **Discriminated Unions & Type Guards:**
   - Standardize on discriminated unions for complex states (e.g. tracking loaded/error/loading UI states).
   - Use explicit user-defined **type guards** or JSON-schema validators to safely parse incoming JSON payloads sent across the Tauri Rust IPC bridge before putting them in store state:
     ```typescript
     export interface Task {
         hash: string;
         description: string;
         project: string | null;
     }

     export function isTask(payload: unknown): payload is Task {
         return (
             typeof payload === "object" &&
             payload !== null &&
             "hash" in payload &&
             "description" in payload
         );
     }
     ```

---

## ⚛️ React Component & Hook Patterns

1. **Component Definitions:**
   - Standardize on functional components with explicit prop typing:
     ```typescript
     interface Props {
         taskHash: string;
         onToggle: (hash: string) => void;
     }

     export function TaskCard({ taskHash, onToggle }: Props) {
         return (
             <div onClick={() => onToggle(taskHash)}>
                 {/* Card layout */}
             </div>
         );
     }
     ```
2. **State Management via Zustand:**
   - Define global actions and state fields in cohesive, separate hooks (`src/hooks/use-task-store.ts`).
   - Subscribe atomically inside cards to prevent full-lane re-renders:
     ```typescript
     // Subscribes strictly to task state changes of this exact hash
     const task = useTaskStore((state) => state.tasks[taskHash]);
     ```

---

## 🧪 Frontend Testing Guidelines

1. **Unit & Hook Testing:**
   - Write tests for custom hooks and utility helper functions (such as relative date math or Kanban routing rules) using **Vitest** + **React Testing Library**.
2. **Test File Isolation:**
   - All tests must live in separate files matching the module name with a `.test.ts` or `.test.tsx` extension, placed directly next to the file being tested:
     ```text
     src/components/
     ├── task-card.tsx
     └── task-card.test.tsx
     ```
