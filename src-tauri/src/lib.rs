pub mod parser;
pub mod db;
pub mod writer;
pub mod query_dsl;
pub mod watcher;

/// The central whitelisted character bracket class representing valid checklist status markers.
/// Matches ' ' (todo), '/' (doing), 'x'/'X' (done), '-' (cancelled), and '<' (calendar event).
pub const CHECKLIST_CHAR_CLASS: &str = r"\sxX<\-/";
