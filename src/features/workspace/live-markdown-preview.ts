import { EditorState, type Extension, type Range } from "@codemirror/state";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

class InlineReplacementWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly className: string,
    readonly label: string | null = null,
  ) {
    super();
  }

  eq(other: InlineReplacementWidget): boolean {
    return (
      this.text === other.text && this.className === other.className && this.label === other.label
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const element = view.dom.ownerDocument.createElement("span");
    element.className = this.className;
    element.textContent = this.text;
    if (this.label) {
      element.setAttribute("role", "img");
      element.setAttribute("aria-label", this.label);
    } else {
      element.setAttribute("aria-hidden", "true");
    }
    return element;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

const bulletWidget = new InlineReplacementWidget("•", "cm-live-list-marker");

function activeLines(state: EditorState): Set<number> {
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const lastPosition =
      range.from < range.to && state.doc.lineAt(range.to).from === range.to
        ? range.to - 1
        : range.to;
    const last = state.doc.lineAt(lastPosition).number;
    for (let line = first; line <= last; line += 1) lines.add(line);
  }
  return lines;
}

function touchesActiveLine(state: EditorState, from: number, to: number, active: Set<number>) {
  const first = state.doc.lineAt(from).number;
  const last = state.doc.lineAt(to).number;
  for (let line = first; line <= last; line += 1) {
    if (active.has(line)) return true;
  }
  return false;
}

function headingLevel(name: string): number | null {
  const match = name.match(/^(?:ATX|Setext)Heading([1-6])$/);
  return match ? Number(match[1]) : null;
}

export function buildLiveMarkdownDecorations(
  state: EditorState,
  active: Set<number> = activeLines(state),
  parsedUpto = state.doc.length,
  parseBudgetMs = 50,
): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const lineClasses = new Map<number, Set<string>>();
  const addLineClass = (position: number, className: string) => {
    const line = state.doc.lineAt(position);
    if (active.has(line.number)) return;
    const classes = lineClasses.get(line.from) ?? new Set<string>();
    classes.add(className);
    lineClasses.set(line.from, classes);
  };
  const addHiddenSyntax = (from: number, to: number, widget?: WidgetType) => {
    if (from === to || touchesActiveLine(state, from, to, active)) return;
    ranges.push(
      Decoration.replace({
        ...(widget ? { widget } : {}),
        inclusive: false,
        liveReplacement: true,
      }).range(from, to),
    );
  };
  const addMark = (from: number, to: number, className: string) => {
    if (from === to || touchesActiveLine(state, from, to, active)) return;
    ranges.push(Decoration.mark({ class: className }).range(from, to));
  };

  const tree = ensureSyntaxTree(state, parsedUpto, parseBudgetMs) ?? syntaxTree(state);
  tree.iterate({
    enter(node) {
      const level = headingLevel(node.name);
      if (level !== null) {
        addLineClass(node.from, `cm-live-heading-${level}`);
        return;
      }

      switch (node.name) {
        case "HeaderMark":
        case "QuoteMark":
        case "EmphasisMark":
        case "StrikethroughMark":
          addHiddenSyntax(node.from, node.to);
          if (node.name === "QuoteMark") addLineClass(node.from, "cm-live-blockquote");
          break;
        case "ListItem":
          addLineClass(node.from, "cm-live-list-item");
          break;
        case "ListMark": {
          const source = state.doc.sliceString(node.from, node.to);
          const widget = /^\d/.test(source)
            ? new InlineReplacementWidget(source, "cm-live-list-marker")
            : bulletWidget;
          addHiddenSyntax(node.from, node.to, widget);
          break;
        }
        case "TaskMarker": {
          const complete = /\[[xX]\]/.test(state.doc.sliceString(node.from, node.to));
          const widget = new InlineReplacementWidget(
            complete ? "✓" : "",
            `cm-live-task-marker${complete ? " is-complete" : ""}`,
            complete ? "Completed task" : "Incomplete task",
          );
          addHiddenSyntax(node.from, node.to, widget);
          break;
        }
        case "StrongEmphasis":
          addMark(node.from, node.to, "cm-live-strong");
          break;
        case "Emphasis":
          addMark(node.from, node.to, "cm-live-emphasis");
          break;
        case "Strikethrough":
          addMark(node.from, node.to, "cm-live-strikethrough");
          break;
        case "InlineCode":
          for (let child = node.node.firstChild; child; child = child.nextSibling) {
            if (child.name === "CodeMark") addHiddenSyntax(child.from, child.to);
          }
          addMark(node.from, node.to, "cm-live-inline-code");
          break;
        case "Link":
          {
            let hasUrl = false;
            let hasTitle = false;
            for (let child = node.node.firstChild; child; child = child.nextSibling) {
              if (child.name === "URL") hasUrl = true;
              if (child.name === "LinkTitle") hasTitle = true;
            }
            if (!hasUrl || hasTitle) break;
            for (let child = node.node.firstChild; child; child = child.nextSibling) {
              if (child.name === "LinkMark" || child.name === "URL") {
                addHiddenSyntax(child.from, child.to);
              }
            }
          }
          addMark(node.from, node.to, "cm-live-link");
          break;
      }
    },
  });

  for (const [from, classes] of lineClasses) {
    ranges.push(Decoration.line({ class: [...classes].join(" ") }).range(from));
  }
  return Decoration.set(ranges, true);
}

class LiveMarkdownPreviewPlugin {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = buildLiveMarkdownDecorations(
      view.state,
      activeLines(view.state),
      view.viewport.to,
      8,
    );
  }

  update(update: ViewUpdate): void {
    if (
      update.docChanged ||
      update.selectionSet ||
      update.viewportChanged ||
      update.geometryChanged ||
      update.focusChanged
    ) {
      // The cursor line stays in source form during IME composition, just like every active line.
      this.decorations = buildLiveMarkdownDecorations(
        update.state,
        activeLines(update.state),
        update.view.viewport.to,
        8,
      );
    }
  }
}

export function liveMarkdownPreview(): Extension {
  return ViewPlugin.fromClass(LiveMarkdownPreviewPlugin, {
    decorations: (plugin) => plugin.decorations,
  });
}
