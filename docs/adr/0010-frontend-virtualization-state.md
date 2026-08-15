# ADR 0010: Frontend List Virtualization and Atomic State Management

## Status

Proposed

## Implementation Status

Partial. Zustand is used for task/custom-view state, but the frontend does not implement the proposed list virtualization or demonstrated per-card atomic subscription architecture. Performance figures are unverified targets.

## Context

Octarine’s Kanban views, calendar boards, and search panels must display highly interactive lists of tasks and events. On web, phone, and desktop screens, rendering hundreds or thousands of rich, interactive card elements (each with contextual menus, metadata badges, drag-and-drop support, and state selectors) causes severe performance degradation:

1. **DOM Bloat:** Large numbers of DOM or virtual nodes degrade browser/webview layout engines, dropping scroll rates well below 60fps.
2. **Cascading Re-renders:** Triggering a state update on a single task card (such as checking off a checkbox) can cause the entire dashboard, lane, or board to re-render under default React state propagation models, causing input lag.

## Decision

We will enforce windowed list rendering and decentralized, atomic state management across all frontend clients (Desktop, Web, and Mobile).

### 1. Viewport-Based List Virtualization

Any reactive list or Kanban lane that has the potential to display more than 50 tasks must utilize windowed rendering using `@tanstack/react-virtual` (or a platform-optimized native equivalent on mobile):

- Only the DOM elements currently visible inside the viewport's bounding box plus a small safety buffer (e.g., 3 cards above and below) are mounted.
- As the user scrolls, DOM elements are recycled and populated with the incoming task data, keeping the absolute node count flat ($O(1)$ scaling relative to vault size).

### 2. Atomic, Non-Cascading State Management

We will standardize on **Zustand** as the reactive state store to achieve selective, atomic component updates:

- Components (such as task cards) will subscribe _surgically_ only to their specific task state using exact ID/hash selectors (e.g., `useTaskStore(state => state.tasks[taskHash])`).
- When a task’s properties are edited via a user gesture or an external file-watch event, Zustand will directly update only the single subscribed card component, completely bypassing parent list or board re-renders.

```
                  [ Zustand Global Task Store ]
                   /            │            \
      (Hash Sub)  /             │             \  (Hash Sub)
                 ▼              ▼              ▼
           [ Card #1 ]     [ Card #2 ]    [ Card #3 ]
           (No Render)    (RE-RENDERED)   (No Render)
                ▲
                │ (Task #2 state changed)
```

## Consequences

- **Positive:**
  - **Buttery-Smooth Scrolling:** Scroll performance remains locked at a consistent 60fps/120fps even when viewing a list of 10,000+ tasks.
  - **Instantaneous Gestures:** Gesture feedback, drag-and-drop operations, and checkbox toggles react with zero input latency (sub-10ms rendering overhead).
- **Negative:**
  - List virtualization requires task cards to have explicit heights or dynamically measured layouts, slightly increasing CSS layout styling complexity.
  - Adds dependency overhead of `@tanstack/react-virtual` and `Zustand` to the frontend bundle (both are extremely lightweight, totaling < 15KB combined).
