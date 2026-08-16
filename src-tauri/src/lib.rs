pub mod db;
pub mod file_ops;
pub mod parser;
pub mod path_security;
pub mod query_dsl;
pub mod watcher;
pub mod writer;

/// The central whitelisted character bracket class representing valid checklist status markers.
/// Matches ' ' (todo), '/' (doing), 'x'/'X' (done), '-' (cancelled), and '<' (calendar event).
pub const CHECKLIST_CHAR_CLASS: &str = r"\sxX<\-/";
