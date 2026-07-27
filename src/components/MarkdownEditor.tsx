import { useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, highlightActiveLine, lineNumbers } from "@codemirror/view";
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
}

export function MarkdownEditor({ 
  filePath, 
  initialContent, 
  onSave, 
  onClose,
  projects = [],
  contexts = []
}: MarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveStatus] = useState<boolean | null>(null);

  // Parse note title from the full filePath
  const fileName = filePath.split("/").pop() || "Untitled Note";

  const getResolvedDateString = (keyword: string): string => {
    const today = new Date();
    if (keyword === "today") {
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    if (keyword === "tomorrow") {
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      const yyyy = tomorrow.getFullYear();
      const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
      const dd = String(tomorrow.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    if (keyword === "monday") {
      const resultDate = new Date(today);
      const currentDay = today.getDay();
      const daysToAdd = currentDay === 1 ? 7 : (1 - currentDay + 7) % 7;
      resultDate.setDate(today.getDate() + (daysToAdd === 0 ? 7 : daysToAdd));
      const yyyy = resultDate.getFullYear();
      const mm = String(resultDate.getMonth() + 1).padStart(2, '0');
      const dd = String(resultDate.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    return "";
  };

  const customCompletionSource = (context: CompletionContext): CompletionResult | null => {
    // 1. Projects trigger: +work
    const projMatch = context.matchBefore(/\+[\w\-/]*/);
    if (projMatch) {
      const typed = projMatch.text.slice(1).toLowerCase();
      const options = projects
        .filter(p => p.toLowerCase().includes(typed))
        .map(p => ({
          label: `+${p}`,
          type: "keyword",
          detail: "project"
        }));
      return {
        from: projMatch.from,
        options
      };
    }

    // 2. Contexts trigger: @phone
    const ctxMatch = context.matchBefore(/@\w*/);
    if (ctxMatch) {
      const typed = ctxMatch.text.slice(1).toLowerCase();
      const options = contexts
        .filter(c => c.toLowerCase().includes(typed))
        .map(c => ({
          label: `@${c}`,
          type: "keyword",
          detail: "context"
        }));
      return {
        from: ctxMatch.from,
        options
      };
    }

    // 3. Date helpers triggers: due:today or s:tomorrow
    const dateMatch = context.matchBefore(/(due:|s:)[\w]*/);
    if (dateMatch) {
      const prefix = dateMatch.text.includes("due:") ? "due:" : "s:";
      const typed = dateMatch.text.slice(prefix.length).toLowerCase();
      const helpers = [
        { name: "today", date: getResolvedDateString("today") },
        { name: "tomorrow", date: getResolvedDateString("tomorrow") },
        { name: "monday", date: getResolvedDateString("monday") }
      ];
      const options = helpers
        .filter(h => h.name.includes(typed))
        .map(h => ({
          label: `${prefix}${h.date}`,
          displayLabel: `${prefix}${h.name} (${h.date})`,
          type: "variable",
          detail: "date helper"
        }));
      return {
        from: dateMatch.from,
        options
      };
    }
    return null;
  };

  const triggerSave = async () => {
    if (!viewRef.current) return;
    const currentContent = viewRef.current.state.doc.toString();
    
    setSaving(true);
    setSaveStatus(null);
    try {
      await onSave(currentContent);
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
  };

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
        }
      }
    ]);

    // Listener extension to track changes and mark document "dirty"
    const changeListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        setIsDirty(true);
      }
    });

    const state = EditorState.create({
      doc: initialContent,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        markdown(),
        oneDark,
        autocompletion({ override: [customCompletionSource] }),
        changeListener,
        saveKeymap,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping
      ]
    });

    const view = new EditorView({
      state,
      parent: containerRef.current
    });

    viewRef.current = view;
    setIsDirty(false);

    // Focus editor automatically on load
    view.focus();

    // Cleanup on unmount
    return () => {
      view.destroy();
    };
  }, [filePath, initialContent]);

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
