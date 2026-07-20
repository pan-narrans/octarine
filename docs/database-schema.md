# SQLite Caching Database Schema

To support sub-millisecond querying, project hierarchies, and high performance over massive vaults (10,000+ files), Octarine utilizes a local SQLite read cache. The SQLite database is strictly a mirror indices layer; the `.md` plaintext files remain the absolute source of truth.

---

## 1. Entity Relationship Diagram

```
       +---------------+             +---------------+
       |     files     |             |  custom_views |
       +---------------+             +---------------+
       | id (PK)       |             | id (PK)       |
       | path (UNIQUE) |<---------+  | file_id (FK)  |
       | mtime         |          |  | line_number   |
       | hash          |          |  | title         |
       +---------------+          |  | query_raw     |
               |                  |  +---------------+
               | (One-to-Many)    |
               v                  |
       +---------------+          |
       |     tasks     |----------+
       +---------------+             +---------------+
       | id (PK)       |             | merge_reviews |
       | file_id (FK)  |             +---------------+
       | line_number   |             | id (PK)       |
       | raw_markdown  |             | file_id (FK)  |
       | hash          |             | line_number   |
       | status        |             | my_state      |
       | type          |             | peer_state    |
       | description   |             | merged_state  |
       | project       |             | timestamp     |
       | due_date      |             +---------------+
       | s_start       |
       | duration_secs |
       | recurring     |
       | when_done     |
       | parse_errors  |
       +---------------+
          |         |
          | (Many-to-Many)
          v         v
    [task_tags]  [task_contexts]
          |         |
          v         v
       [tags]    [contexts]
```

---

## 2. Table Definitions

### 2.1 Table: `files`
Tracks document paths, modifications, and checksum hashes to manage cache invalidation on startup.

```sql
CREATE TABLE files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    mtime INTEGER NOT NULL,            -- Unix timestamp of filesystem modification
    hash TEXT NOT NULL                 -- File checksum to detect direct content edits
);

CREATE INDEX idx_files_path ON files(path);
```

### 2.2 Table: `tasks`
Stores the extracted metadata from parsed tasks.

```sql
CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL,
    line_number INTEGER NOT NULL,      -- Starting line index in the source file
    raw_markdown TEXT NOT NULL,        -- Complete block raw text (including nested blocks)
    hash TEXT NOT NULL,                -- Hash of FilePath + Starting Line + RawMarkdown
    status TEXT NOT NULL,              -- 'todo' ([ ]), 'doing' ([/]), 'done' ([x])
    type TEXT NOT NULL,                -- 'task' or 'event' ([>])
    description TEXT NOT NULL,         -- Pure description text stripped of meta tags
    project TEXT,                      -- Hierarchy path (e.g. 'work/client/project-a')
    due_date TEXT,                     -- 'YYYY-MM-DD'
    s_start TEXT,                      -- Scheduled ISO start (e.g., 'YYYY-MM-DD HH:MM')
    duration_secs INTEGER,             -- Event duration in seconds
    recurring TEXT,                    -- Raw recurring rule (cron or text)
    when_done TEXT,                    -- 'delete' or 'archive'
    parse_errors TEXT,                 -- Null if clean, JSON string containing errors if present
    FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
);

CREATE INDEX idx_tasks_hash ON tasks(hash);
CREATE INDEX idx_tasks_due ON tasks(due_date);
CREATE INDEX idx_tasks_scheduled ON tasks(s_start);
CREATE INDEX idx_tasks_project ON tasks(project);
```

### 2.3 Table: `tags`
Generic hashtags parsed from markdown tasks (e.g., `#urgent`).

```sql
CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE INDEX idx_tags_name ON tags(name);
```

### 2.4 Table: `task_tags` (Many-to-Many Link)
```sql
CREATE TABLE task_tags (
    task_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (task_id, tag_id),
    FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
```

### 2.5 Table: `contexts`
Specific contexts prefixed with `@` (e.g., `@computer`).

```sql
CREATE TABLE contexts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE INDEX idx_contexts_name ON contexts(name);
```

### 2.6 Table: `task_contexts` (Many-to-Many Link)
```sql
CREATE TABLE task_contexts (
    task_id INTEGER NOT NULL,
    context_id INTEGER NOT NULL,
    PRIMARY KEY (task_id, context_id),
    FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY(context_id) REFERENCES contexts(id) ON DELETE CASCADE
);
```

### 2.7 Table: `custom_views`
Stores the registered query blocks found in files throughout the vault.

```sql
CREATE TABLE custom_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL,
    line_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    query_raw TEXT NOT NULL,           -- Direct raw codeblock text configuration
    FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
);
```

### 2.8 Table: `merge_reviews` (v2.0 Sync Conflicts Auditing)
Logs the history of CRDT auto-merges, allowing the user to review, diff, and manually revert any concurrent edits.

```sql
CREATE TABLE merge_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL,
    line_number INTEGER NOT NULL,
    my_state TEXT NOT NULL,            -- Local state prior to auto-merge
    peer_state TEXT NOT NULL,          -- Remote state incoming from peer
    merged_state TEXT NOT NULL,        -- Reconciled state written to disk
    timestamp INTEGER NOT NULL,        -- Unix timestamp of sync merge transaction
    FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
);

CREATE INDEX idx_merge_reviews_timestamp ON merge_reviews(timestamp);
```

---

## 3. Caching Strategy Mechanics

1. **Boot Sweep:**
   * Get all absolute file paths from the disk.
   * Query SQLite: `SELECT path, mtime FROM files`.
   * Compare `mtime`.
     * **If matched:** Skip parsing.
     * **If unmatched or new:** Read and parse file. Insert/Update `files` and trigger downstream `tasks` updates.
     * **If file is deleted on disk:** Delete from `files` (cascades deletes to tasks, tags, and contexts).
