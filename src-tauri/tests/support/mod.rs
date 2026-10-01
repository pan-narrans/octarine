use octarine::{db, parser::ParsedTask};
use rusqlite::Connection;
use std::{collections::BTreeMap, fs, path::PathBuf};
use tempfile::{tempdir, TempDir};

pub const NOTES: &str = include_str!("../fixtures/vault/notes.md");
pub const EDGE: &str = include_str!("../fixtures/vault/edge.md");

pub struct Vault {
    pub temp: TempDir,
    pub root: PathBuf,
    pub db: Connection,
}

impl Vault {
    pub fn new() -> Self {
        let temp = tempdir().unwrap();
        let root = temp.path().join("vault");
        fs::create_dir(&root).unwrap();
        let root = root.canonicalize().unwrap();
        let db = db::initialize_db(temp.path().join("cache.sqlite3")).unwrap();
        Self { temp, root, db }
    }

    pub fn representative() -> Self {
        let vault = Self::new();
        for (path, content) in [
            ("notes.md", NOTES),
            ("edge.md", EDGE),
            (
                "projects/work.md",
                include_str!("../fixtures/vault/projects/work.md"),
            ),
            (
                "projects/work/client.md",
                include_str!("../fixtures/vault/projects/work/client.md"),
            ),
        ] {
            vault.write(path, content);
        }
        db::boot_sweep(&vault.db, &vault.root).unwrap();
        vault
    }

    pub fn write(&self, relative: &str, content: &str) -> PathBuf {
        let path = self.root.join(relative);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, content).unwrap();
        path
    }

    pub fn tasks(&self) -> Vec<ParsedTask> {
        db::query_tasks(&self.db, "1=1", &[]).unwrap()
    }

    pub fn files(&self) -> BTreeMap<String, Vec<u8>> {
        fn visit(
            root: &std::path::Path,
            path: &std::path::Path,
            files: &mut BTreeMap<String, Vec<u8>>,
        ) {
            for entry in fs::read_dir(path).unwrap() {
                let path = entry.unwrap().path();
                if path.is_dir() {
                    visit(root, &path, files);
                } else {
                    files.insert(
                        path.strip_prefix(root)
                            .unwrap()
                            .to_string_lossy()
                            .into_owned(),
                        fs::read(path).unwrap(),
                    );
                }
            }
        }
        let mut files = BTreeMap::new();
        visit(&self.root, &self.root, &mut files);
        files
    }
}
