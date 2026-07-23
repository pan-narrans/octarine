import { useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, highlightActiveLine, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { Save, X, Check, Loader2 } from "lucide-react";

interface MarkdownEditorProps {
  filePath: string;
  initialContent: string;
  onSave: (content: string) => Promise<void>;
  onClose: () => void;
}

export function MarkdownEditor({ filePath, initialContent, onSave, onClose }: MarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveStatus] = useState<boolean | null>(null);

  // Parse note title from the full filePath
  const fileName = filePath.split("/").pop() || "Untitled Note";

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
