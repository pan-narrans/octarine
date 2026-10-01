use chrono::Utc;
use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

const DIAGNOSTICS_FILE_NAME: &str = "diagnostics.jsonl";
const MAX_DIAGNOSTICS_BYTES: u64 = 1_048_576;

#[derive(Clone)]
pub struct Diagnostics {
    inner: Arc<DiagnosticsInner>,
}

struct DiagnosticsInner {
    path: PathBuf,
    write_lock: Mutex<()>,
}

#[derive(Serialize)]
struct DiagnosticEvent<'a> {
    timestamp: String,
    level: &'a str,
    event: &'a str,
    message: &'a str,
}

impl Diagnostics {
    pub fn new(app_directory: &Path) -> Result<Self, String> {
        fs::create_dir_all(app_directory)
            .map_err(|e| format!("Failed to create diagnostics directory: {e}"))?;
        Ok(Self {
            inner: Arc::new(DiagnosticsInner {
                path: app_directory.join(DIAGNOSTICS_FILE_NAME),
                write_lock: Mutex::new(()),
            }),
        })
    }

    pub fn info(&self, event: &'static str, message: &'static str) {
        self.record("info", event, message);
    }

    pub fn error(&self, event: &'static str, message: &'static str) {
        self.record("error", event, message);
    }

    fn record(&self, level: &'static str, event: &'static str, message: &'static str) {
        let Ok(_guard) = self.inner.write_lock.lock() else {
            return;
        };
        let should_truncate = self
            .inner
            .path
            .metadata()
            .is_ok_and(|metadata| metadata.len() >= MAX_DIAGNOSTICS_BYTES);
        let event = DiagnosticEvent {
            timestamp: Utc::now().to_rfc3339(),
            level,
            event,
            message,
        };
        let Ok(encoded) = serde_json::to_string(&event) else {
            return;
        };
        let Ok(mut file) = OpenOptions::new()
            .create(true)
            .write(true)
            .append(!should_truncate)
            .truncate(should_truncate)
            .open(&self.inner.path)
        else {
            return;
        };
        let _ = writeln!(file, "{encoded}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn writes_structured_events_without_runtime_details() {
        let temp = tempdir().unwrap();
        let diagnostics = Diagnostics::new(temp.path()).unwrap();

        diagnostics.error("index.file_failed", "A Markdown file could not be indexed.");

        let content = fs::read_to_string(temp.path().join(DIAGNOSTICS_FILE_NAME)).unwrap();
        let event: serde_json::Value = serde_json::from_str(content.trim()).unwrap();
        assert_eq!(event["level"], "error");
        assert_eq!(event["event"], "index.file_failed");
        assert_eq!(event["message"], "A Markdown file could not be indexed.");
        assert!(event["timestamp"].is_string());
        assert_eq!(event.as_object().unwrap().len(), 4);
    }

    #[test]
    fn truncates_an_oversized_diagnostics_file() {
        let temp = tempdir().unwrap();
        let path = temp.path().join(DIAGNOSTICS_FILE_NAME);
        fs::write(&path, vec![b'x'; MAX_DIAGNOSTICS_BYTES as usize]).unwrap();
        let diagnostics = Diagnostics::new(temp.path()).unwrap();

        diagnostics.info("app.started", "Octarine started.");

        let content = fs::read_to_string(path).unwrap();
        assert!(content.len() < 1_000);
        assert!(content.contains("app.started"));
    }
}
