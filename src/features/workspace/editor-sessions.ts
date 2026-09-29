const normalize = (content: string) => content.replace(/\r\n/g, "\n");

type Save = (content: string, originalContent: string) => Promise<void>;

// Conservative UI matching only; Rust remains responsible for canonical path authorization.
export function isEditorPathWithin(path: string, root: string): boolean {
  const key = (value: string) => value.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  const candidate = key(path);
  const parent = key(root);
  return candidate === parent || candidate.startsWith(`${parent}/`);
}

/** Memory-only buffers. Source snapshots stay unchanged until a write succeeds. */
export class EditorSession {
  content: string;
  originalContent: string;
  saving = false;
  saved = false;
  locked = false;
  private listeners = new Set<() => void>();

  constructor(
    content: string,
    private readonly onIdle: () => void,
  ) {
    this.content = normalize(content);
    this.originalContent = content;
  }

  get dirty() {
    return this.content !== normalize(this.originalContent);
  }

  get retained() {
    return this.dirty || this.saving || this.locked || this.listeners.size > 0;
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      this.onIdle();
    };
  }

  private publish() {
    this.listeners.forEach((listener) => listener());
    this.onIdle();
  }

  edit(content: string) {
    if (this.locked) return;
    this.content = normalize(content);
    this.saved = false;
    this.publish();
  }

  setLocked(locked: boolean): void {
    if (locked === this.locked) return;
    this.locked = locked;
    this.publish();
  }

  refresh(content: string) {
    if (this.dirty || this.saving || content === this.originalContent) return;
    this.originalContent = content;
    this.content = normalize(content);
    this.saved = false;
    this.publish();
  }

  async save(write: Save) {
    if (this.locked || this.saving || !this.dirty) return;
    const content = this.content;
    const original = this.originalContent;
    this.saving = true;
    this.saved = false;
    this.publish();
    try {
      await write(content, original);
      this.originalContent = content;
      this.saved = !this.dirty;
    } finally {
      this.saving = false;
      this.publish();
    }
  }
}

export class EditorSessions {
  private sessions = new Map<string, EditorSession>();
  private mutations = new Set<readonly string[]>();

  private isLocked(path: string): boolean {
    return [...this.mutations].some((paths) =>
      paths.some((root) => isEditorPathWithin(path, root)),
    );
  }

  async withCleanPaths<T>(paths: readonly string[], operation: () => Promise<T>): Promise<T> {
    for (const lockedPaths of this.mutations) {
      if (
        paths.some((path) =>
          lockedPaths.some(
            (root) => isEditorPathWithin(path, root) || isEditorPathWithin(root, path),
          ),
        )
      ) {
        throw new Error("Wait for the current file operation to finish before retrying.");
      }
    }
    for (const [path, session] of this.sessions) {
      if (
        (session.dirty || session.saving) &&
        paths.some((root) => isEditorPathWithin(path, root))
      ) {
        throw new Error(`Save changes in ${path} and wait for saving to finish before retrying.`);
      }
    }
    this.mutations.add(paths);
    const updateLocks = () => {
      for (const [path, session] of this.sessions) session.setLocked(this.isLocked(path));
    };
    try {
      updateLocks();
      return await operation();
    } finally {
      this.mutations.delete(paths);
      updateLocks();
    }
  }

  open(path: string, content: string) {
    let session = this.sessions.get(path);
    if (!session) {
      const created = new EditorSession(content, () => {
        if (!created.retained && this.sessions.get(path) === created) this.sessions.delete(path);
      });
      session = created;
      this.sessions.set(path, session);
      session.setLocked(this.isLocked(path));
    }
    return session;
  }

  get hasUnsavedChanges() {
    return [...this.sessions.values()].some((session) => session.dirty || session.saving);
  }
}

export const editorSessions = new EditorSessions();
