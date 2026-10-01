# Markdown Editor

## Editing and preview

The note and journal editor uses CodeMirror 6 with GitHub-Flavored Markdown syntax, line wrapping,
line numbers, search, folding, project/context/date completions, and guarded save. Editor, live,
split, and preview views are presentations of one mounted editor view and one `MarkdownEditor`
session. Live view renders supported Markdown syntax with CodeMirror decorations while preserving
the source document; the active or selected lines reveal their source markers for editing. Mode
changes do not discard selection, undo history, unsaved source, or the save precondition. Preview
reflects current editor text, including unsaved changes.

The outline is derived from CodeMirror's Markdown syntax tree. It lists heading positions, refreshes
as source changes, and moves the editor selection to the selected heading. Fold gutter and
CodeMirror's fold keymap expose foldable headings and fenced code blocks where the Markdown parser
provides fold ranges.

The formatting toolbar writes source Markdown for bold, italic, strikethrough, inline code, links,
headings, quotes, bullet lists, numbered lists, task lists, and fenced code blocks. With no selection,
inline marks wrap the word at the caret or create a marker pair; line commands affect the current
line or selected lines. Existing task checkboxes remain source text; the task-list command inserts
GFM checkbox syntax without creating a second task parser.

Keyboard shortcuts:

- `Mod-S` saves (`Command` on macOS, `Control` elsewhere).
- `Mod-B` toggles bold and `Mod-I` toggles italic.
- `Mod-F` opens CodeMirror search. `Mod-G` moves to next search match.
- CodeMirror fold keymap uses `Ctrl-Shift-[` / `Ctrl-Shift-]` to fold/unfold at the cursor and
  `Ctrl-Alt-[` / `Ctrl-Alt-]` to fold/unfold all.

## Preview links and resources

Preview uses `react-markdown` with `remark-gfm`. Raw HTML is not enabled. HTTP and HTTPS links open
through Tauri's opener plugin after URL validation. All other links pass through
`resolve_markdown_link(documentPath, target)` before app navigation. Rust canonicalizes the source
document and target beneath configured vault root, rejects URI schemes, absolute paths, query
strings, traversal, escaping symlinks, missing files, and non-Markdown targets, and returns canonical
path plus optional decoded heading fragment. Same-document fragments use the same native check.

Preview never creates `<img>` elements, so Markdown cannot trigger remote, `file:`, or other
embedded-resource loads. Imported images appear as disabled preview placeholders. Relative links to
non-Markdown attachments are not opened by preview. External applications and app-level navigation
still receive only paths approved by Rust.

## Attachments

The attachment picker sends selected file name and bytes through `import_attachment(documentPath,
fileName, bytes)`. Rust requires an existing Markdown document inside the configured vault, accepts
only one safe filename component, and writes under that document's sibling `attachments/` directory.
The directory is created on demand and canonicalized under the same vault root. Import first writes a
temporary sibling and then atomically installs it without replacing an existing path. Name conflicts
use deterministic suffixes before the final extension (`image.png`, `image-2.png`, `image-3.png`).
The typed result returns actual filename and portable path relative to the document directory.

The editor inserts an image link for browser-reported image MIME types and a normal Markdown link
otherwise. Insertion is a CodeMirror transaction, so it remains dirty until saved through the normal
file-session lifecycle. Source files are not overwritten and imports do not enable remote sync.

Local image rendering remains disabled until secure asset resolution is available. Attachment bytes
are held in memory during IPC; no separate import size limit is currently enforced.
