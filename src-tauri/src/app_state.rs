use crate::config::AppConfig;
use crate::diagnostics::Diagnostics;
use notify::RecommendedWatcher;
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub db_path: String,
    pub vault_dir: Mutex<String>,
    pub journal_dir: Mutex<String>,
    pub config: Mutex<AppConfig>,
    pub config_path: PathBuf,
    pub watcher: Mutex<Option<RecommendedWatcher>>,
    pub diagnostics: Diagnostics,
}

impl AppState {
    pub fn new(
        connection: Connection,
        db_path: String,
        vault_dir: String,
        journal_dir: String,
        config: AppConfig,
        config_path: PathBuf,
        diagnostics: Diagnostics,
    ) -> Self {
        Self {
            db: Mutex::new(connection),
            db_path,
            vault_dir: Mutex::new(vault_dir),
            journal_dir: Mutex::new(journal_dir),
            config: Mutex::new(config),
            config_path,
            watcher: Mutex::new(None),
            diagnostics,
        }
    }
}
