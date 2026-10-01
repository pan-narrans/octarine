import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { buildLiveMarkdownDecorations } from "./live-markdown-preview";

function decorationsFor(state: EditorState, activeLines?: Set<number>) {
  const decorations: Array<{
    from: number;
    to: number;
    className: string;
    widget: unknown;
    replacement: boolean;
  }> = [];
  const set =
    activeLines === undefined
      ? buildLiveMarkdownDecorations(state)
      : buildLiveMarkdownDecorations(state, activeLines);
  set.between(0, state.doc.length, (from, to, value) => {
    decorations.push({
      from,
      to,
      className: String(value.spec.class ?? ""),
      widget: value.spec.widget,
      replacement: value.spec.liveReplacement === true,
    });
  });
  return decorations;
}

function markdownState(doc: string, cursor = 0): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [markdown({ base: markdownLanguage })],
  });
}

describe("live Markdown preview decorations", () => {
  it("renders common inline and block Markdown while preserving source document", () => {
    const source = [
      "# Heading",
      "**bold** and *italic* and ~~removed~~ and `code`",
      "[link](reference.md)",
      "> quoted text",
      "- [x] completed",
      "- [ ] open",
      "1. ordered",
    ].join("\n");
    const state = markdownState(source, source.length);
    const decorations = decorationsFor(state, new Set());
    const replacements = decorations
      .filter(({ replacement }) => replacement)
      .map(({ from, to }) => state.doc.sliceString(from, to));
    const classes = decorations.map(({ className }) => className);

    expect(replacements).toEqual(
      expect.arrayContaining([
        "#",
        "**",
        "*",
        "~~",
        "`",
        "[",
        "]",
        "(",
        "reference.md",
        ">",
        "-",
        "[x]",
        "[ ]",
        "1.",
      ]),
    );
    expect(classes).toContain("cm-live-heading-1");
    expect(classes).toContain("cm-live-strong");
    expect(classes).toContain("cm-live-emphasis");
    expect(classes).toContain("cm-live-strikethrough");
    expect(classes).toContain("cm-live-inline-code");
    expect(classes).toContain("cm-live-link");
    expect(state.doc.toString()).toBe(source);
  });

  it("hides syntax only for inline code and untitled inline links", () => {
    const source = [
      "`inline code`",
      "```ts",
      "const value = 1;",
      "```",
      "[inline link](note.md)",
      "[reference link][target]",
      '[titled link](note.md "Label")',
      "![image](image.png)",
    ].join("\n");
    const state = markdownState(source);
    const replacements = decorationsFor(state, new Set())
      .filter(({ replacement }) => replacement)
      .map(({ from, to }) => state.doc.sliceString(from, to));

    expect(replacements).toEqual(["`", "`", "[", "]", "(", "note.md", ")"]);
    expect(state.doc.toString()).toBe(source);
  });

  it("leaves active lines in source form while rendering inactive lines", () => {
    const source = "# Heading\n**active bold**\n- inactive item";
    const cursor = source.indexOf("active") + 2;
    const state = markdownState(source, cursor);
    const decorations = decorationsFor(state, new Set([2]));
    const replaced = decorations
      .filter(({ replacement }) => replacement)
      .map(({ from, to }) => state.doc.sliceString(from, to));

    expect(replaced).not.toContain("**");
    expect(replaced).toContain("#");
    expect(replaced).toContain("-");
    expect(state.doc.sliceString(0)).toBe(source);
  });

  it("keeps selected list lines in source form when selection ends at next line", () => {
    const source = "- first\n- second\n- third";
    const state = EditorState.create({
      doc: source,
      selection: { anchor: 2, head: source.lastIndexOf("- third") },
      extensions: [markdown({ base: markdownLanguage })],
    });
    const replacements = decorationsFor(state)
      .filter(({ replacement }) => replacement)
      .map(({ from, to }) => state.doc.sliceString(from, to));

    expect(replacements).toEqual(["-"]);
  });

  it("reveals every list marker on selected lines", () => {
    const source = "- first\n- second\n- third";
    const state = EditorState.create({
      doc: source,
      selection: { anchor: 2, head: source.length },
      extensions: [markdown({ base: markdownLanguage })],
    });

    const replacements = decorationsFor(state)
      .filter(({ replacement }) => replacement)
      .map(({ from, to }) => state.doc.sliceString(from, to));

    expect(replacements).toEqual([]);
  });
});
