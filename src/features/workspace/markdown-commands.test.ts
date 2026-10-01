import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { applyMarkdownCommand, attachmentMarkdown } from "./markdown-commands";

describe("Markdown inline commands", () => {
  it("wraps selected text and preserves selection", () => {
    expect(applyMarkdownCommand("write clearly", 6, 13, "bold")).toEqual({
      text: "write **clearly**",
      selectionFrom: 8,
      selectionTo: 15,
    });
  });

  it("wraps word at caret and unwraps it on repeat", () => {
    const wrapped = applyMarkdownCommand("write clearly", 9, 9, "italic");
    expect(wrapped).toEqual({
      text: "write *clearly*",
      selectionFrom: 7,
      selectionTo: 14,
    });
    expect(
      applyMarkdownCommand(wrapped.text, wrapped.selectionFrom, wrapped.selectionTo, "italic"),
    ).toEqual({
      text: "write clearly",
      selectionFrom: 6,
      selectionTo: 13,
    });
  });

  it("creates paired markers at an empty caret and selects link URL", () => {
    expect(applyMarkdownCommand("", 0, 0, "inline-code")).toEqual({
      text: "``",
      selectionFrom: 1,
      selectionTo: 1,
    });
    expect(applyMarkdownCommand("", 0, 0, "link")).toEqual({
      text: "[link text](url)",
      selectionFrom: 12,
      selectionTo: 15,
    });
  });

  it("inserts a link around selected text", () => {
    expect(applyMarkdownCommand("read note", 5, 9, "link")).toEqual({
      text: "read [note](url)",
      selectionFrom: 12,
      selectionTo: 15,
    });
  });
});

describe("Markdown line and block commands", () => {
  it("sets or removes heading level on current line", () => {
    expect(applyMarkdownCommand("Title\nbody", 2, 2, "heading-2")).toEqual({
      text: "## Title\nbody",
      selectionFrom: 5,
      selectionTo: 5,
    });
    expect(applyMarkdownCommand("## Title", 5, 5, "heading-2")).toEqual({
      text: "Title",
      selectionFrom: 2,
      selectionTo: 2,
    });
  });

  it("formats each selected line as a quote and task list", () => {
    expect(applyMarkdownCommand("one\ntwo", 0, 7, "quote").text).toBe("> one\n> two");
    expect(applyMarkdownCommand("one\ntwo", 0, 7, "task-list").text).toBe("- [ ] one\n- [ ] two");
  });

  it("toggles bullet lists and numbers ordered items", () => {
    expect(applyMarkdownCommand("one\ntwo", 0, 7, "bullet-list").text).toBe("- one\n- two");
    expect(applyMarkdownCommand("- one\n- two", 0, 11, "bullet-list").text).toBe("one\ntwo");
    expect(applyMarkdownCommand("one\ntwo", 0, 7, "numbered-list").text).toBe("1. one\n1. two");
  });

  it("preserves indentation when removing nested list markers", () => {
    expect(applyMarkdownCommand("    - nested", 7, 7, "bullet-list").text).toBe("    nested");
    expect(applyMarkdownCommand("    12. nested", 9, 9, "numbered-list").text).toBe("    nested");
    expect(applyMarkdownCommand("    - [x] nested", 10, 10, "task-list").text).toBe("    nested");
  });

  it("formats an empty first line without shifting or duplicating source", () => {
    expect(applyMarkdownCommand("\nbody", 0, 0, "heading-1")).toEqual({
      text: "# \nbody",
      selectionFrom: 2,
      selectionTo: 2,
    });
    expect(applyMarkdownCommand("\nbody", 0, 0, "bullet-list").text).toBe("- \nbody");
  });

  it("inserts empty fences or wraps selected code", () => {
    expect(applyMarkdownCommand("text", 4, 4, "fenced-code")).toEqual({
      text: "```\ntext\n```",
      selectionFrom: 8,
      selectionTo: 8,
    });
    expect(applyMarkdownCommand("const x = 1", 0, 11, "fenced-code").text).toBe(
      "```\nconst x = 1\n```",
    );
  });

  it("expands partial selections to complete source lines for fenced code", () => {
    const source = "before\n  const value = 1;\nafter";
    const start = source.indexOf("value") + 1;
    const edit = applyMarkdownCommand(source, start, start + 2, "fenced-code");
    expect(edit.text).toBe("before\n```\n  const value = 1;\n```\nafter");
    expect(edit.selectionFrom).toBe(11);
    expect(edit.selectionTo).toBe(29);
  });
});

describe("attachment Markdown", () => {
  it("uses relative encoded paths and escapes labels", () => {
    expect(attachmentMarkdown("A [diagram].png", "attachments/A diagram.png", true)).toBe(
      "![A \\[diagram\\].png](attachments/A%20diagram.png)",
    );
    expect(attachmentMarkdown("report.pdf", "attachments/report.pdf", false)).toBe(
      "[report.pdf](attachments/report.pdf)",
    );
  });

  it("percent-encodes parentheses in portable attachment destinations", () => {
    for (const fileName of ["a(b.pdf", "a)b.pdf", "a(b).pdf"]) {
      const markdownSource = attachmentMarkdown(fileName, `attachments/${fileName}`, false);
      const encodedName = encodeURIComponent(fileName)
        .replaceAll("(", "%28")
        .replaceAll(")", "%29");
      expect(markdownSource).toBe(`[${fileName}](attachments/${encodedName})`);

      const state = EditorState.create({
        doc: markdownSource,
        extensions: [markdown({ base: markdownLanguage })],
      });
      const destinations: string[] = [];
      syntaxTree(state).iterate({
        enter(node) {
          if (node.name === "URL") destinations.push(state.doc.sliceString(node.from, node.to));
        },
      });
      expect(destinations).toEqual([`attachments/${encodedName}`]);
    }
  });
});
