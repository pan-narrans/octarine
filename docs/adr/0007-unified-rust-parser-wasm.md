# ADR 0007: Unified Rust-Native AST Parser with WebAssembly Compilation

## Status

Proposed

## Implementation Status

Partial and deferred. Canonical task parsing is implemented in native Rust as a source-preserving structural scanner, not a CommonMark AST parser. WASM bindings and browser/mobile targets are not implemented.

## Context

Octarine must run with extreme high performance across all three target environments:

1. **Desktop App:** Tauri (native Rust core).
2. **Phone App:** Tauri Mobile (iOS/Android native Rust core or WebView sandbox).
3. **Web App:** Standard web browser (React SPA).

To parse Markdown vaults and index task metadata rapidly (processing 10,000+ files and 100,000+ tasks in milliseconds), we require a high-performance AST parser.

If we write the parser in JavaScript/TypeScript, we incur single-threaded CPU bottlenecks and high Garbage Collection (GC) pauses in web and phone webviews. If we write it in native-only Rust, the Web App cannot run it, forcing us to write and maintain a duplicate, slower parser in JavaScript.

## Decision

We will write the Markdown and Metadata AST Parser **entirely in Rust** (`pulldown-cmark` or a lightweight custom push-parser) with a prioritized phased release strategy:

- **Phase 1 (v1.0 Desktop & v2.0 Primary Mobile):** Compiled strictly as native binaries for Desktop (Tauri) and Native Mobile (Tauri Mobile for iOS/Android). This represents our first-priority goal, guaranteeing maximum local-first system execution.
- **Phase 2 (v2.0 Deferred Future):** Compiled to WebAssembly (WASM via `wasm-pack`) for standard web browsers. This target is explicitly deferred to a later phase to focus near-term engineering on high-performance native experiences.

```
                  ┌──────────────────────────────┐
                  │  Shared Stateless Parser     │
                  │         (Rust Core)          │
                  └──────────────┬───────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼ (PHASE 1: CURRENT / v2.0)     ▼ (PHASE 2: DEFERRED LATER)
     [ Native Machine Code ]             [ WebAssembly (WASM) ]
     - Desktop App (Tauri)               - Web App (Browser)
     - Mobile App (Tauri Mobile iOS)     - Web Sandbox / Fallback
     - Mobile App (Tauri Mobile Android)
```

## Consequences

- **Positive:**
  - **Single Source of Truth:** 100% code reuse. The exact same parsing logic, token extraction patterns, and line-shift resiliency code are shared across Desktop, Mobile, and Web.
  - **Sub-Millisecond Performance:** The parser runs at near-native speed inside the browser's WASM engine, avoiding JavaScript parsing bottlenecks.
  - **Zero IPC Bloat:** On Desktop and Native Mobile, parsing is kept entirely on the native side. The frontend WebView only receives lightweight, pre-filtered JSON query results rather than raw file buffers.
- **Negative:**
  - Requires maintaining a WebAssembly compilation and binding pipeline (`wasm-pack`), slightly increasing initial build system complexity.
