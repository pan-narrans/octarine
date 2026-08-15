import { useCallback, useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, highlightActiveLine, lineNumbers, tooltips } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { autocompletion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { Save, X, Check, Loader2 } from "lucide-react";

interface MarkdownEditorProps {
  filePath: string;
  initialContent: string;
  onSave: (content: string) => Promise<void>;
  onClose: () => void;
  projects?: string[];
  contexts?: string[];
  isInline?: boolean;
}

export function MarkdownEditor({
  filePath,
  initialContent,
  onSave,
  onClose,
  projects = [],
  contexts = [],
  isInline = false,
}: MarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onSaveRef = useRef(onSave);
  const onCloseRef = useRef(onClose);
  const projectsRef = useRef(projects);
  const contextsRef = useRef(contexts);

  onSaveRef.current = onSave;
  onCloseRef.current = onClose;
  projectsRef.current = projects;
  contextsRef.current = contexts;

  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveStatus] = useState<boolean | null>(null);

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
    if (!viewRef.current) return;
    const currentContent = viewRef.current.state.doc.toString();

    setSaving(true);
    setSaveStatus(null);
    try {
      await onSaveRef.current(currentContent);
      setIsDirty(false);
      setSaveStatus(true);
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (e) {
      console.error("Save failed:", e);
      setSaveStatus(false);
      setTimeout(() => setSaveStatus(null), 3000);
    } finally {
      setSaving(false);
    }
  }, []);

  // Initialize CodeMirror 6 View
  useEffect(() => {
    if (!containerRef.current) return;

    // Custom Keymap including Cmd+S / Ctrl+S to save
    const saveKeymap = keymap.of([
      {
        key: "Mod-s",
        run: () => {
          triggerSave();
          return true;
        },
      },
      {
        key: "Escape",
        run: () => {
          if (isInline) {
            onCloseRef.current();
            return true;
          }
          return false;
        },
      },
    ]);

    // Listener extension to track changes and mark document "dirty"
    const changeListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        setIsDirty(true);
      }
    });

    const extensions = [
      history(),
      markdown(),
      oneDark,
      autocompletion({ override: [customCompletionSource] }),
      tooltips({ parent: document.body }),
      changeListener,
      saveKeymap,
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
    ];

    if (!isInline) {
      extensions.unshift(lineNumbers(), highlightActiveLine());
    } else {
      extensions.push(
        EditorView.domEventHandlers({
          blur: () => {
            triggerSave();
          },
        }),
      );
    }

    const state = EditorState.create({
      doc: initialContent,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;
    setIsDirty(false);

    // Focus editor automatically on load
    view.focus();

    // Cleanup on unmount
    return () => {
      view.destroy();
    };
  }, [customCompletionSource, filePath, initialContent, isInline, triggerSave]);

  if (isInline) {
    return <div ref={containerRef} className="editor-canvas inline-mode" />;
  }

  return (
    <div className="editor-workspace">
      {/* Editor Header Panel */}
      <div className="editor-header">
        <div className="editor-meta">
          <h3>{fileName}</h3>
          <span className="editor-path">{filePath}</span>
        </div>

        <div className="editor-actions">
          {isDirty && <span className="dirty-dot" title="Unsaved changes" />}

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

      {/* CodeMirror Element */}
      <div ref={containerRef} className="editor-canvas" />
    </div>
  );
}
