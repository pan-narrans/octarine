pub mod app_state;
pub mod config;
pub mod db;
pub mod diagnostics;
pub mod file_ops;
pub mod parser;
pub mod path_security;
pub mod project;
pub mod project_rename;
pub mod query_dsl;
pub mod task_creation;
pub mod task_service;
pub mod task_writer;
pub mod template;
pub mod vault_ignore;
pub mod watcher;
pub mod watcher_service;
pub mod writer;

/// The central whitelisted character bracket class representing valid checklist status markers.
/// Matches ' ' (todo), '/' (doing), '>' (deferred), 'x'/'X' (done), '-' (cancelled),
/// and '<' (calendar event).
pub const CHECKLIST_CHAR_CLASS: &str = r"\sxX<>\-/";

#[cfg(test)]
mod ipc_bindings {
    use super::*;
    use ts_rs::TS;

    #[test]
    #[ignore = "run through npm run ipc:generate"]
    fn export_bindings() {
        let config = ts_rs::Config::from_env();
        config::DestinationTemplate::export(&config).unwrap();
        config::DestinationTemplates::export(&config).unwrap();
        config::InsertionConfig::export(&config).unwrap();
        config::InsertionMode::export(&config).unwrap();
        config::TaskCreationConfig::export(&config).unwrap();
        config::UnprojectedDestination::export(&config).unwrap();
        file_ops::FileNode::export(&config).unwrap();
        parser::ParsedCustomView::export(&config).unwrap();
        parser::ParsedTask::export(&config).unwrap();
        project_rename::ProjectRenameCollision::export(&config).unwrap();
        project_rename::ProjectRenameCollisionCode::export(&config).unwrap();
        project_rename::ProjectRenameError::export(&config).unwrap();
        project_rename::ProjectRenameErrorCode::export(&config).unwrap();
        project_rename::ProjectRenameImpact::export(&config).unwrap();
        project_rename::ProjectRenameIndexUpdate::export(&config).unwrap();
        project_rename::ProjectRenameMove::export(&config).unwrap();
        project_rename::ProjectRenameMoveKind::export(&config).unwrap();
        project_rename::ProjectRenamePlan::export(&config).unwrap();
        project_rename::ProjectRenameRecoveryReport::export(&config).unwrap();
        project_rename::ProjectRenameRewrite::export(&config).unwrap();
        project_rename::ProjectRenameResult::export(&config).unwrap();
        task_creation::CaptureContext::export(&config).unwrap();
        task_creation::TaskDraft::export(&config).unwrap();
        task_creation::TaskDraftPreview::export(&config).unwrap();
        task_creation::TaskDraftError::export(&config).unwrap();
        task_creation::TaskDraftErrorCode::export(&config).unwrap();
        task_creation::TaskPriority::export(&config).unwrap();
        task_creation::TaskStatus::export(&config).unwrap();
        task_creation::TaskType::export(&config).unwrap();
        task_service::CreateTaskError::export(&config).unwrap();
        task_service::CreateTaskErrorCode::export(&config).unwrap();
        task_service::CreateTaskResult::export(&config).unwrap();
        task_service::MoveTaskProjectError::export(&config).unwrap();
        task_service::MoveTaskProjectErrorCode::export(&config).unwrap();
        task_service::MoveTaskProjectResult::export(&config).unwrap();
        task_service::UndoCreateReceipt::export(&config).unwrap();
        task_writer::CreateWarning::export(&config).unwrap();
        task_writer::CreateWarningCode::export(&config).unwrap();
        task_writer::InsertionResult::export(&config).unwrap();
        writer::WriteErrorCode::export(&config).unwrap();
        writer::WriteError::export(&config).unwrap();
    }
}
