use crate::diagnostics::Diagnostics;
use crate::watcher::start_watcher;
use notify::RecommendedWatcher;
use tauri::Emitter;

pub fn build_vault_watcher(
    db_path: &str,
    vault_dir: &str,
    app: tauri::AppHandle,
    diagnostics: Diagnostics,
) -> Result<RecommendedWatcher, String> {
    start_watcher(
        db_path.to_string(),
        vault_dir.to_string(),
        Some(diagnostics),
        move || {
            let _ = app.emit("vault-changed", ());
        },
    )
    .map_err(|e| format!("Failed to watch configured vault: {e}"))
}
