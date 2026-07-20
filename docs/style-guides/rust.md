# Rust Style Guide & Coding Standards

This document establishes the structural, naming, formatting, and performance guidelines for all Rust development within the Octarine codebase (`src-tauri/`).

---

## 🚦 Linter & Formatting Standards

We utilize the standard Rust tooling pipeline for quality enforcement. All checks must pass without warnings during CI compilation.

1. **Linter:** **Clippy** is our primary static analysis tool.
   - Run command: `cargo clippy --all-targets -- -D warnings`
   - *Policy:* Disabling Clippy rules or using `#![allow(...)]` attributes is strictly prohibited unless approved by team consensus and documented with an inline comment explaining the rationale.
2. **Formatter:** **Rustfmt** is our strict formatting engine.
   - Run command: `cargo fmt --all -- --check`
   - *Policy:* All files must be formatted with standard `rustfmt` rules before staging or committing changes.

---

## 📝 Naming Conventions

We strictly follow standard Rust API guidelines:

| Item | Case Style | Example | Note |
| :--- | :--- | :--- | :--- |
| **Modules / Files** | `snake_case` | `parser.rs`, `db.rs` | Keep files lowercase and short. |
| **Structs / Enums / Traits** | `CamelCase` | `TaskParser`, `TaskState` | Avoid acronym-only caps (e.g., use `XmlParser`, not `XMLParser`). |
| **Functions / Variables** | `snake_case` | `parse_line()`, `task_hash` | Be explicit; avoid cryptic abbreviations. |
| **Constants / Statics** | `SCREAMING_SNAKE_CASE`| `DEFAULT_CACHE_SIZE` | Always declare explicit types for statics. |
| **Type Parameters** | `CamelCase` | `T`, `Serializer` | Use single letters for generic bounds, or descriptive names. |

---

## 🛡️ Error Handling Patterns

Robust, predictable error handling is vital for a local-first system.

1. **No Panics in Production:**
   - The use of `.unwrap()`, `.expect()`, or `panic!` is **strictly forbidden** in production code paths. 
   - *Exceptions:* Test files, or initialization routines where immediate failure is preferred (e.g. failing to open the database on boot).
2. **Explicit Error Structuring:**
   - **Domain/Module Level:** Use the `thiserror` crate to define explicit, typed, and structured error enums:
     ```rust
     #[derive(Debug, thiserror::Error)]
     pub enum ParserError {
         #[error("Failed to read file: {0}")]
         IoError(#[from] std::io::Error),
         #[error("Line-shift search failed for hash {0}")]
         LineNotFound(String),
     }
     ```
   - **Application/Command Level:** Use `anyhow` for top-level Tauri IPC command boundaries to easily aggregate and map sub-module errors to JSON/String responses.
3. **Explicit Propagation:**
   - Always propagate errors using the `?` operator or convert them cleanly using `.map_err()`.

---

## ⚡ Concurrency & Memory Management

Performance is one of our primary value propositions.

1. **Zero-Copy Parsing:**
   - Leverage Rust lifetimes (`&'a str`) to reference segments of the source Markdown buffer within our AST tokens, avoiding heap cloning of strings during parser streams.
2. **Explicit Thread Locking:**
   - Avoid standard library `std::sync::Mutex` as it can poison on panics and has slower lock resolution.
   - **Standardize on `parking_lot`:** Use `parking_lot::Mutex` and `parking_lot::RwLock` for faster, non-poisoning thread synchronization.
3. **Parallel Iteration:**
   - Walk directories and perform batch parsing using **Rayon** for data-parallelism:
     ```rust
     use rayon::prelude::*;
     let parsed_tasks: Vec<Task> = files.par_iter().map(|f| parse_file(f)).collect();
     ```

---

## 🧪 Testing Guidelines (Isolated Submodule Pattern)

To keep production source files clean, readable, and highly focused, **unit tests must never be written inline** inside the same source file. Instead, we enforce the **Submodule Directory Pattern**, which retains access to private fields and functions without file clutter.

### 📂 File Structure Layout:
For a source file named `src/parser.rs`, its unit tests must live inside a sibling directory and file matching the module's name:
```text
src-tauri/src/
├── parser.rs
└── parser/
    └── tests.rs
```

### 1. In the Production Source File (`src-tauri/src/parser.rs`):
Declare the tests module as a conditional submodule without braces:
```rust
// Production implementation logic here
pub fn parse_line(line: &str) -> bool {
    line.starts_with("- [ ]")
}

#[cfg(test)]
mod tests; // Declares the separate test file
```

### 2. In the Test Submodule File (`src-tauri/src/parser/tests.rs`):
Import all modules (including private structs and functions) from the parent file using `super`:
```rust
use super::*; // Import both public and private items from parent

#[test]
fn test_parse_line_boundary() {
    assert!(parse_line("- [ ] A standard task"));
    assert!(!parse_line("Plaintext line"));
}
```

### 3. Integration Tests:
For black-box integration testing of the crate's **public API** only (which do not require private access), write tests inside the standard top-level cargo `tests/` directory:
```text
src-tauri/
├── Cargo.toml
├── src/
└── tests/
    └── database_integration_tests.rs
```
