import { useCallback, useEffect, useRef, useState } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, highlightActiveLine, lineNumbers, tooltips } from "@codemirror/view";
import {
  foldGutter,
  foldKeymap,
  forceParsing,
  syntaxTree,
  syntaxTreeAvailable,
} from "@codemirror/language";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { search, searchKeymap } from "@codemirror/search";
import { oneDark } from "@codemirror/theme-one-dark";
import { autocompletion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Save, X, Check, Loader2, Paperclip } from "lucide-react";
import { editorSessions, type EditorSession } from "../features/workspace/editor-sessions";
import {
  applyMarkdownCommand,
  attachmentMarkdown,
  type MarkdownCommand,
} from "../features/workspace/markdown-commands";
import { MarkdownPreview } from "./MarkdownPreview";
import {
  isExternalWebLink,
  markdownHeadingBase,
} from "../features/workspace/markdown-link-validation";
import type { AttachmentImportResult } from "../generated/ipc/AttachmentImportResult";
import type { MarkdownLinkTarget } from "../generated/ipc/MarkdownLinkTarget";
import { liveMarkdownPreview } from "../features/workspace/live-markdown-preview";

export type EditorViewMode = "editor" | "live" | "split" | "preview";

interface MarkdownHeading {
  level: number;
  title: string;
  from: number;
}

interface MarkdownEditorProps {
  filePath: string;
  initialContent: string;
  onSave: (content: string, originalContent: string) => Promise<void>;
  onClose: () => void;
  projects?: string[];
  contexts?: string[];
  onOpenMarkdownLink?: (documentPath: string, target: string) => Promise<MarkdownLinkTarget>;
  onImportAttachment?: (fileName: string, bytes: Uint8Array) => Promise<AttachmentImportResult>;
  initialViewMode?: EditorViewMode;
  initialOutlineOpen?: boolean;
  targetFragment?: string | null;
  onFragmentNavigated?: () => void;
}

function readOutline(state: EditorState): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      const match = node.name.match(/(?:ATX|Setext)Heading([1-6])/);
      if (!match) return;
      const level = Number(match[1]);
      const source = state.doc.sliceString(node.from, node.to);
      const title = source
        .replace(/^[ \t]{0,3}#{1,6}[ \t]*/, "")
        .replace(/[ \t]+#{1,}[ \t]*$/, "")
        .replace(/\n[=-]+[ \t]*$/, "")
        .replace(/[\r\n]+/g, " ")
        .trim();
      if (title) headings.push({ level, title, from: node.from });
    },
  });
  return headings;
}

function dispatchMarkdownEdit(
  view: EditorView,
  updated: string,
  selectionFrom: number,
  selectionTo: number,
) {
  const original = view.state.doc.toString();
  let from = 0;
  while (from < original.length && from < updated.length && original[from] === updated[from])
    from += 1;
  let originalTo = original.length;
  let updatedTo = updated.length;
  while (
    originalTo > from &&
    updatedTo > from &&
    original[originalTo - 1] === updated[updatedTo - 1]
  ) {
    originalTo -= 1;
    updatedTo -= 1;
  }
  view.dispatch({
    changes: { from, to: originalTo, insert: updated.slice(from, updatedTo) },
    selection: { anchor: selectionFrom, head: selectionTo },
    scrollIntoView: true,
  });
}

function applyFormattingCommand(view: EditorView | null, command: MarkdownCommand): boolean {
  if (!view || view.state.readOnly) return false;
  const selection = view.state.selection.main;
  const edit = applyMarkdownCommand(
    view.state.doc.toString(),
    selection.from,
    selection.to,
    command,
  );
  if (edit.text !== view.state.doc.toString()) {
    dispatchMarkdownEdit(view, edit.text, edit.selectionFrom, edit.selectionTo);
  }
  view.focus();
  return true;
}

export function MarkdownEditor({
  filePath,
  initialContent,
  onSave,
  onClose,
  projects = [],
  contexts = [],
  onOpenMarkdownLink,
  onImportAttachment,
  initialViewMode = "editor",
  initialOutlineOpen = false,
  targetFragment = null,
  onFragmentNavigated,
}: MarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const liveMarkdownCompartment = useRef(new Compartment());
  const onSaveRef = useRef(onSave);
  const initialContentRef = useRef(initialContent);
  const sessionRef = useRef<EditorSession | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  initialContentRef.current = initialContent;
  const projectsRef = useRef(projects);
  const contextsRef = useRef(contexts);
  const onFragmentNavigatedRef = useRef(onFragmentNavigated);

  onSaveRef.current = onSave;
  projectsRef.current = projects;
  contextsRef.current = contexts;
  onFragmentNavigatedRef.current = onFragmentNavigated;

  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [locked, setLocked] = useState<boolean>(false);
  const [saveSuccess, setSaveStatus] = useState<boolean | null>(null);
  const [viewMode, setViewMode] = useState<EditorViewMode>(initialViewMode);
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;
  const [outlineOpen, setOutlineOpen] = useState(initialOutlineOpen);
  const [previewContent, setPreviewContent] = useState(initialContent);
  const [outline, setOutline] = useState<MarkdownHeading[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  // Parse note title from the full filePath
  const fileName = filePath.split("/").pop() || "Untitled Note";

  const getPredictiveDates = useCallback(
    (typed: string): Array<{ label: string; displayLabel: string; date: string }> => {
      const clean = typed.trim().toLowerCase();
      const today = new Date();

      const formatDate = (d: Date): string => {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
      };

      if (!clean) {
        // Suggest defaults if they just typed s: or due: with nothing else
        const dTomorrow = new Date(today);
        dTomorrow.setDate(today.getDate() + 1);

        const dMonday = new Date(today);
        const currentDay = today.getDay();
        let daysToAdd = (1 - currentDay + 7) % 7;
        if (daysToAdd === 0) daysToAdd = 7;
        dMonday.setDate(today.getDate() + daysToAdd);

        return [
          { label: "today", displayLabel: `today (${formatDate(today)})`, date: formatDate(today) },
          {
            label: "tomorrow",
            displayLabel: `tomorrow (${formatDate(dTomorrow)})`,
            date: formatDate(dTomorrow),
          },
          {
            label: "monday",
            displayLabel: `monday (${formatDate(dMonday)})`,
            date: formatDate(dMonday),
          },
        ];
      }

      const results: Array<{ label: string; displayLabel: string; date: string }> = [];

      // 1. Direct keywords
      if ("today".startsWith(clean)) {
        results.push({
          label: "today",
          displayLabel: `today (${formatDate(today)})`,
          date: formatDate(today),
        });
      }
      if ("tomorrow".startsWith(clean) || "tmr".startsWith(clean)) {
        const d = new Date(today);
        d.setDate(today.getDate() + 1);
        results.push({
          label: "tomorrow",
          displayLabel: `tomorrow (${formatDate(d)})`,
          date: formatDate(d),
        });
      }
      if ("yesterday".startsWith(clean)) {
        const d = new Date(today);
        d.setDate(today.getDate() - 1);
        results.push({
          label: "yesterday",
          displayLabel: `yesterday (${formatDate(d)})`,
          date: formatDate(d),
        });
      }
      if ("next week".startsWith(clean)) {
        const d = new Date(today);
        d.setDate(today.getDate() + 7);
        results.push({
          label: "next week",
          displayLabel: `next week (${formatDate(d)})`,
          date: formatDate(d),
        });
      }

      // 2. Predictive Numbers matching: e.g. "in 3", "2", "in 5 days"
      const numMatch = clean.match(/^(?:in\s+)?(\d+)(?:\s*([dw]?)[\w]*)?$/);
      if (numMatch) {
        const num = parseInt(numMatch[1], 10);
        const unit = numMatch[2] || ""; // "d" or "w" or ""

        if (unit === "" || unit === "d") {
          const d = new Date(today);
          d.setDate(today.getDate() + num);
          results.push({
            label: `in ${num} days`,
            displayLabel: `in ${num} days (${formatDate(d)})`,
            date: formatDate(d),
          });
        }

        if (unit === "" || unit === "w") {
          const d = new Date(today);
          d.setDate(today.getDate() + num * 7);
          results.push({
            label: `in ${num} weeks`,
            displayLabel: `in ${num} weeks (${formatDate(d)})`,
            date: formatDate(d),
          });
        }
      }

      // 3. Weekdays matching: e.g. "mon", "tue", "next mon"
      const weekdays = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
      ];
      const isNext = clean.startsWith("next ");
      const dayTyped = isNext ? clean.slice(5) : clean;

      if (dayTyped.length > 0) {
        weekdays.forEach((dayName, targetDayIndex) => {
          if (dayName.startsWith(dayTyped)) {
            const currentDayIndex = today.getDay();
            let daysToAdd = (targetDayIndex - currentDayIndex + 7) % 7;
            if (daysToAdd === 0) daysToAdd = 7; // strict future

            if (isNext) {
              daysToAdd += 7;
            }

            const d = new Date(today);
            d.setDate(today.getDate() + daysToAdd);

            const labelText = isNext ? `next ${dayName}` : dayName;
            results.push({
              label: labelText,
              displayLabel: `${labelText} (${formatDate(d)})`,
              date: formatDate(d),
            });
          }
        });
      }

      return results;
    },
    [],
  );

  const customCompletionSource = useCallback(
    (context: CompletionContext): CompletionResult | null => {
      // 1. Projects trigger: +work
      const projMatch = context.matchBefore(/\+[\w\-/]*/);
      if (projMatch) {
        const typed = projMatch.text.slice(1).toLowerCase();
        const options = projectsRef.current
          .filter((p) => p.toLowerCase().includes(typed))
          .map((p) => ({
            label: `+${p}`,
            type: "keyword",
            detail: "project",
          }));
        return {
          from: projMatch.from,
          options,
        };
      }

      // 2. Contexts trigger: @phone
      const ctxMatch = context.matchBefore(/@\w*/);
      if (ctxMatch) {
        const typed = ctxMatch.text.slice(1).toLowerCase();
        const options = contextsRef.current
          .filter((c) => c.toLowerCase().includes(typed))
          .map((c) => ({
            label: `@${c}`,
            type: "keyword",
            detail: "context",
          }));
        return {
          from: ctxMatch.from,
          options,
        };
      }

      // 3. Date helpers triggers: due:today or s:tomorrow
      const dateMatch = context.matchBefore(/(due:|s:)[\w\s]*/);
      if (dateMatch) {
        const prefix = dateMatch.text.includes("due:") ? "due:" : "s:";
        const typed = dateMatch.text.slice(prefix.length);

        const helpers = getPredictiveDates(typed);
        const options = helpers.map((h) => ({
          label: `${prefix}${h.date}`,
          displayLabel: `${prefix}${h.displayLabel}`,
          type: "variable",
          detail: "date helper",
        }));
        return {
          from: dateMatch.from,
          options,
        };
      }
      return null;
    },
    [getPredictiveDates],
  );

  const triggerSave = useCallback(async () => {
    try {
      await sessionRef.current?.save(onSaveRef.current);
    } catch (e) {
      console.error("Save failed:", e);
    }
  }, []);

  // Keep one CodeMirror view mounted while editor, split, and preview presentations change.
  useEffect(() => {
    if (!containerRef.current) return;
    const session = editorSessions.open(filePath, initialContentRef.current);
    sessionRef.current = session;
    const readOnly = new Compartment();
    let outlineTimer: ReturnType<typeof setTimeout> | null = null;
    let outlineGeneration = 0;

    const scheduleOutlineParsing = (view: EditorView) => {
      const document = view.state.doc;
      const generation = ++outlineGeneration;
      if (outlineTimer !== null) clearTimeout(outlineTimer);

      const parseSlice = () => {
        outlineTimer = null;
        if (
          generation !== outlineGeneration ||
          viewRef.current !== view ||
          view.state.doc !== document
        ) {
          return;
        }
        forceParsing(view, document.length, 8);
        setOutline(readOutline(view.state));
        if (!syntaxTreeAvailable(view.state, document.length)) {
          outlineTimer = setTimeout(parseSlice, 16);
        }
      };

      outlineTimer = setTimeout(parseSlice, 0);
    };

    const saveKeymap = keymap.of([
      {
        key: "Mod-s",
        run: () => {
          triggerSave();
          return true;
        },
      },
      { key: "Mod-b", run: () => applyFormattingCommand(viewRef.current, "bold") },
      { key: "Mod-i", run: () => applyFormattingCommand(viewRef.current, "italic") },
    ]);

    const changeListener = EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      const content = update.state.doc.toString();
      setPreviewContent(content);
      setOutline(readOutline(update.state));
      if (content !== session.content) session.edit(content);
      scheduleOutlineParsing(update.view);
    });

    const state = EditorState.create({
      doc: session.content,
      extensions: [
        readOnly.of([
          EditorState.readOnly.of(session.locked),
          EditorView.editable.of(!session.locked),
        ]),
        history(),
        markdown({ base: markdownLanguage }),
        liveMarkdownCompartment.current.of(
          viewModeRef.current === "live" ? liveMarkdownPreview() : [],
        ),
        oneDark,
        autocompletion({ override: [customCompletionSource] }),
        tooltips({ parent: document.body }),
        changeListener,
        saveKeymap,
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...foldKeymap]),
        search(),
        foldGutter(),
        EditorView.lineWrapping,
        lineNumbers(),
        highlightActiveLine(),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;
    setPreviewContent(session.content);
    setOutline(readOutline(state));
    setLocked(session.locked);

    const syncSession = () => {
      if (view.state.readOnly !== session.locked) {
        view.dispatch({
          effects: readOnly.reconfigure([
            EditorState.readOnly.of(session.locked),
            EditorView.editable.of(!session.locked),
          ]),
        });
      }
      if (view.state.doc.toString() !== session.content) {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: session.content } });
      }
      setLocked(session.locked);
      setSaving(session.saving);
      setIsDirty(session.dirty);
      setSaveStatus(session.saved ? true : null);
      if (statusTimerRef.current !== null) clearTimeout(statusTimerRef.current);
      if (session.saved) statusTimerRef.current = setTimeout(() => setSaveStatus(null), 2000);
    };
    const unsubscribe = session.subscribe(syncSession);
    session.refresh(initialContentRef.current);
    syncSession();
    scheduleOutlineParsing(view);

    view.focus();
    return () => {
      if (statusTimerRef.current !== null) clearTimeout(statusTimerRef.current);
      outlineGeneration += 1;
      if (outlineTimer !== null) clearTimeout(outlineTimer);
      if (viewRef.current === view) viewRef.current = null;
      if (sessionRef.current === session) sessionRef.current = null;
      unsubscribe();
      view.destroy();
    };
  }, [customCompletionSource, filePath, triggerSave]);

  useEffect(() => {
    sessionRef.current?.refresh(initialContent);
  }, [initialContent]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: liveMarkdownCompartment.current.reconfigure(
        viewMode === "live" ? liveMarkdownPreview() : [],
      ),
    });
    view.requestMeasure();
  }, [viewMode]);

  useEffect(() => {
    if (viewMode === "editor" || viewMode === "split") viewRef.current?.requestMeasure();
  }, [viewMode]);

  useEffect(() => {
    if (!targetFragment) return;
    if (viewMode !== "preview") {
      setViewMode("preview");
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      const headingId = markdownHeadingBase(targetFragment);
      const target = Array.from(
        previewRef.current?.querySelectorAll("h1, h2, h3, h4, h5, h6") ?? [],
      ).find((heading) => heading.id === targetFragment || heading.id === headingId);
      if (target) {
        target.scrollIntoView({ block: "start" });
        onFragmentNavigatedRef.current?.();
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [previewContent, targetFragment, viewMode]);

  const runMarkdownCommand = (command: MarkdownCommand) => {
    applyFormattingCommand(viewRef.current, command);
  };

  const scrollToFragment = (fragment: string) => {
    const headingId = markdownHeadingBase(fragment);
    setViewMode("preview");
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const target = Array.from(
          previewRef.current?.querySelectorAll("h1, h2, h3, h4, h5, h6") ?? [],
        ).find((heading) => heading.id === fragment || heading.id === headingId);
        target?.scrollIntoView({ block: "start" });
      });
    });
  };

  const openMarkdownLink = (href: string) => {
    if (isExternalWebLink(href)) {
      void openUrl(href).catch((error: unknown) => setMessage(String(error)));
      return;
    }
    if (!onOpenMarkdownLink) {
      setMessage("Internal Markdown links are unavailable here.");
      return;
    }
    void onOpenMarkdownLink(filePath, href)
      .then((target) => {
        if (target.path === filePath && target.fragment) scrollToFragment(target.fragment);
      })
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : String(error)),
      );
  };

  const importSelectedAttachment = async (file?: File) => {
    if (!file || !onImportAttachment) return;
    const view = viewRef.current;
    const session = sessionRef.current;
    if (!view || !session || session.locked || view.state.readOnly) return;
    const isCurrentEditor = () => viewRef.current === view && sessionRef.current === session;
    const canInsert = () => isCurrentEditor() && !session.locked && !view.state.readOnly;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!canInsert()) return;
      const result = await onImportAttachment(file.name, bytes);
      if (!isCurrentEditor()) return;
      if (!canInsert()) {
        setMessage("Attachment imported, but this document became read-only before insertion.");
        return;
      }
      const insertion = attachmentMarkdown(
        result.fileName,
        result.relativePath,
        file.type.toLocaleLowerCase().startsWith("image/"),
      );
      const { from, to } = view.state.selection.main;
      view.dispatch({
        changes: { from, to, insert: insertion },
        selection: { anchor: from + insertion.length },
        scrollIntoView: true,
      });
      view.focus();
      setMessage(`Imported ${result.fileName}`);
    } catch (error) {
      if (isCurrentEditor()) {
        setMessage(error instanceof Error ? error.message : String(error));
      }
    }
  };

  const jumpToHeading = (heading: MarkdownHeading) => {
    const view = viewRef.current;
    if (!view) return;
    if (viewMode === "preview") setViewMode("editor");
    view.dispatch({
      selection: { anchor: heading.from },
      effects: EditorView.scrollIntoView(heading.from, { y: "center" }),
    });
    window.requestAnimationFrame(() => view.focus());
  };

  const commandButtons: Array<{ command: MarkdownCommand; label: string; title: string }> = [
    { command: "bold", label: "B", title: "Bold (Cmd/Ctrl+B)" },
    { command: "italic", label: "I", title: "Italic (Cmd/Ctrl+I)" },
    { command: "strikethrough", label: "S̶", title: "Strikethrough" },
    { command: "inline-code", label: "`code`", title: "Inline code" },
    { command: "link", label: "Link", title: "Link" },
    { command: "heading-1", label: "H1", title: "Heading 1" },
    { command: "heading-2", label: "H2", title: "Heading 2" },
    { command: "heading-3", label: "H3", title: "Heading 3" },
    { command: "quote", label: "Quote", title: "Block quote" },
    { command: "bullet-list", label: "• List", title: "Bullet list" },
    { command: "numbered-list", label: "1. List", title: "Numbered list" },
    { command: "task-list", label: "☐ Task", title: "Task list" },
    { command: "fenced-code", label: "Code block", title: "Fenced code block" },
  ];

  return (
    <div className="editor-workspace">
      <div className="editor-header">
        <div className="editor-meta">
          <h3>{fileName}</h3>
          <span className="editor-path">{filePath}</span>
        </div>

        <div className="editor-actions">
          {isDirty && (
            <span className="dirty-dot" title="Unsaved changes" aria-label="Unsaved changes" />
          )}
          <button className="editor-btn save" onClick={triggerSave} disabled={saving || !isDirty}>
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : saveSuccess === true ? (
              <Check size={14} color="#10b981" />
            ) : (
              <Save size={14} />
            )}
            {saving ? "Saving..." : saveSuccess === true ? "Saved" : "Save (Cmd+S)"}
          </button>
          <button className="editor-btn close" onClick={onClose}>
            <X size={14} />
            Close
          </button>
        </div>
      </div>

      <div className="editor-formatting-toolbar" role="toolbar" aria-label="Markdown formatting">
        <div className="editor-formatting-group" role="group" aria-label="Formatting commands">
          {commandButtons.map(({ command, label, title }) => (
            <button
              key={command}
              type="button"
              className="editor-tool-btn"
              aria-label={title.split(" (")[0]}
              title={title}
              disabled={locked}
              onClick={() => runMarkdownCommand(command)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className="editor-tool-btn"
            aria-label="Import attachment"
            title="Import attachment"
            disabled={locked || !onImportAttachment}
            onClick={() => attachmentInputRef.current?.click()}
          >
            <Paperclip size={14} />
            <span>Attach</span>
          </button>
          <input
            ref={attachmentInputRef}
            type="file"
            className="editor-attachment-input"
            aria-label="Choose attachment"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              void importSelectedAttachment(file);
              event.currentTarget.value = "";
            }}
          />
        </div>
        <div
          className="editor-formatting-group editor-view-switch"
          role="group"
          aria-label="Editor view mode"
        >
          {(["editor", "live", "split", "preview"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`editor-tool-btn${viewMode === mode ? " active" : ""}`}
              aria-pressed={viewMode === mode}
              onClick={() => setViewMode(mode)}
            >
              {mode === "editor"
                ? "Editor"
                : mode === "live"
                  ? "Live"
                  : mode === "split"
                    ? "Split"
                    : "Preview"}
            </button>
          ))}
          <button
            type="button"
            className={`editor-tool-btn${outlineOpen ? " active" : ""}`}
            aria-pressed={outlineOpen}
            aria-label="Toggle document outline"
            onClick={() => setOutlineOpen((open) => !open)}
          >
            Outline
          </button>
        </div>
      </div>

      {message && (
        <div className="editor-message" role="status">
          {message}
        </div>
      )}

      <div
        className={`editor-content editor-view-${viewMode}${outlineOpen ? " outline-open" : ""}`}
      >
        {outlineOpen && (
          <aside className="editor-outline" aria-label="Document outline">
            <h4>Outline</h4>
            {outline.length === 0 ? (
              <p>No headings</p>
            ) : (
              <nav>
                {outline.map((heading, index) => (
                  <button
                    key={`${heading.from}-${index}`}
                    type="button"
                    title={heading.title}
                    onClick={() => jumpToHeading(heading)}
                    style={{ paddingInlineStart: `${8 + (heading.level - 1) * 12}px` }}
                  >
                    {heading.title}
                  </button>
                ))}
              </nav>
            )}
          </aside>
        )}
        <div className="editor-source-pane">
          <div
            ref={containerRef}
            className={`editor-canvas${viewMode === "preview" ? " editor-canvas-hidden" : ""}`}
            aria-label="Markdown source editor"
          />
        </div>
        {(viewMode === "preview" || viewMode === "split") && (
          <div ref={previewRef} className="editor-preview-pane">
            <MarkdownPreview content={previewContent} onOpenLink={openMarkdownLink} />
          </div>
        )}
      </div>
    </div>
  );
}
