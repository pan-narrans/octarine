pub mod config;
pub mod db;
pub mod diagnostics;
pub mod file_ops;
pub mod parser;
pub mod path_security;
pub mod query_dsl;
pub mod watcher;
pub mod writer;

/// The central whitelisted character bracket class representing valid checklist status markers.
/// Matches ' ' (todo), '/' (doing), 'x'/'X' (done), '-' (cancelled), and '<' (calendar event).
pub const CHECKLIST_CHAR_CLASS: &str = r"\sxX<\-/";

#[cfg(test)]
mod ipc_bindings {
    use super::*;
    use ts_rs::TS;

    #[test]
    #[ignore = "run through npm run ipc:generate"]
    fn export_bindings() {
        let config = ts_rs::Config::from_env();
        file_ops::FileNode::export(&config).unwrap();
        parser::ParsedCustomView::export(&config).unwrap();
        parser::ParsedTask::export(&config).unwrap();
        writer::WriteErrorCode::export(&config).unwrap();
        writer::WriteError::export(&config).unwrap();
    }
}
