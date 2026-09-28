const normalize = (content: string) => content.replace(/\r\n/g, "\n");

type Save = (content: string, originalContent: string) => Promise<void>;

/** Memory-only buffers. Source snapshots stay unchanged until a write succeeds. */
export class EditorSession {
  content: string;
  originalContent: string;
  saving = false;
  saved = false;
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
    return this.dirty || this.saving || this.listeners.size > 0;
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
    this.content = normalize(content);
    this.saved = false;
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
    if (this.saving || !this.dirty) return;
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

  open(path: string, content: string) {
    let session = this.sessions.get(path);
    if (!session) {
      const created = new EditorSession(content, () => {
        if (!created.retained && this.sessions.get(path) === created) this.sessions.delete(path);
      });
      session = created;
      this.sessions.set(path, session);
    }
    return session;
  }

  get hasUnsavedChanges() {
    return [...this.sessions.values()].some((session) => session.dirty || session.saving);
  }
}

export const editorSessions = new EditorSessions();
