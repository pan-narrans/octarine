export type MarkdownCommand =
  | "bold"
  | "italic"
  | "strikethrough"
  | "inline-code"
  | "link"
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "quote"
  | "bullet-list"
  | "numbered-list"
  | "task-list"
  | "fenced-code";

export interface MarkdownEdit {
  text: string;
  selectionFrom: number;
  selectionTo: number;
}

const inlineMarkers: Partial<Record<MarkdownCommand, string>> = {
  bold: "**",
  italic: "*",
  strikethrough: "~~",
  "inline-code": "`",
};

function wordRangeAt(text: string, position: number): [number, number] | null {
  const isWord = (character: string | undefined) =>
    character !== undefined && /[\p{L}\p{N}_-]/u.test(character);
  let from = position;
  let to = position;

  if (!isWord(text[from]) && from > 0 && isWord(text[from - 1])) from -= 1;
  if (!isWord(text[from])) return null;
  while (from > 0 && isWord(text[from - 1])) from -= 1;
  to = Math.max(to, from + 1);
  while (to < text.length && isWord(text[to])) to += 1;
  return [from, to];
}

function inlineEdit(
  text: string,
  from: number,
  to: number,
  command: MarkdownCommand,
): MarkdownEdit {
  const marker = inlineMarkers[command];
  if (command === "link") {
    const range = from === to ? wordRangeAt(text, from) : null;
    const start = range?.[0] ?? from;
    const end = range?.[1] ?? to;
    const label = end > start ? text.slice(start, end) : "link text";
    const insertion = `[${label}](url)`;
    const selectionFrom = start + label.length + 3;
    return {
      text: text.slice(0, start) + insertion + text.slice(end),
      selectionFrom,
      selectionTo: selectionFrom + 3,
    };
  }

  if (!marker) return { text, selectionFrom: from, selectionTo: to };
  const range = from === to ? wordRangeAt(text, from) : null;
  const start = range?.[0] ?? from;
  const end = range?.[1] ?? to;
  const selected = text.slice(start, end);
  const hasMarkers =
    selected.length > marker.length * 2 && selected.startsWith(marker) && selected.endsWith(marker);

  if (hasMarkers) {
    const unwrapped = selected.slice(marker.length, -marker.length);
    return {
      text: text.slice(0, start) + unwrapped + text.slice(end),
      selectionFrom: start,
      selectionTo: start + unwrapped.length,
    };
  }

  if (
    start >= marker.length &&
    text.slice(start - marker.length, start) === marker &&
    text.slice(end, end + marker.length) === marker
  ) {
    const unwrapped = text.slice(start, end);
    return {
      text: text.slice(0, start - marker.length) + unwrapped + text.slice(end + marker.length),
      selectionFrom: start - marker.length,
      selectionTo: end - marker.length,
    };
  }

  if (from === to && range === null) {
    return {
      text: text.slice(0, from) + marker + marker + text.slice(to),
      selectionFrom: from + marker.length,
      selectionTo: from + marker.length,
    };
  }

  return {
    text: text.slice(0, start) + marker + selected + marker + text.slice(end),
    selectionFrom: start + marker.length,
    selectionTo: start + marker.length + selected.length,
  };
}

interface LineEdit {
  text: string;
  oldPrefixLength: number;
  newPrefixLength: number;
}

function prefixLine(line: string, command: MarkdownCommand): LineEdit {
  const headingLevel = command.startsWith("heading-") ? Number(command.slice(-1)) : 0;
  if (headingLevel) {
    const heading = line.match(/^(\s{0,3})(#{1,6})(?:\s+|$)/);
    const indentation = heading?.[1] ?? "";
    const body = heading ? line.slice(heading[0].length) : line;
    const currentLevel = heading?.[2].length ?? 0;
    const newPrefix =
      currentLevel === headingLevel ? indentation : `${indentation}${"#".repeat(headingLevel)} `;
    const oldPrefix = heading ? heading[0] : "";
    return {
      text: `${newPrefix}${body}`,
      oldPrefixLength: oldPrefix.length,
      newPrefixLength: newPrefix.length,
    };
  }

  if (command === "quote") {
    const quote = line.match(/^(\s{0,3}> ?)/);
    const newPrefix = quote ? "" : "> ";
    return {
      text: `${newPrefix}${quote ? line.slice(quote[0].length) : line}`,
      oldPrefixLength: quote?.[0].length ?? 0,
      newPrefixLength: newPrefix.length,
    };
  }

  const list = line.match(/^(\s*)(?:(\d+)[.)]|([-*+]))(?:\s+\[([ xX])\])?\s+(.*)$/);
  const indentation = list?.[1] ?? "";
  const body = list?.[5] ?? line.slice(indentation.length);
  const oldPrefixLength = list ? line.length - body.length : indentation.length;

  if (command === "numbered-list") {
    const isNumbered = list?.[2] !== undefined;
    return {
      text: isNumbered ? `${indentation}${body}` : `${indentation}1. ${body}`,
      oldPrefixLength,
      newPrefixLength: indentation.length + (isNumbered ? 0 : 3),
    };
  }

  if (command === "task-list") {
    const isTask = list?.[3] !== undefined && list[4] !== undefined;
    if (isTask) {
      return {
        text: `${indentation}${body}`,
        oldPrefixLength,
        newPrefixLength: indentation.length,
      };
    }
    const checkbox = list?.[4] ?? " ";
    const newPrefix = `${indentation}- [${checkbox}] `;
    return {
      text: `${newPrefix}${body}`,
      oldPrefixLength,
      newPrefixLength: newPrefix.length,
    };
  }

  const isBullet = list?.[3] !== undefined && list[4] === undefined;
  if (command === "bullet-list") {
    return {
      text: isBullet ? `${indentation}${body}` : `${indentation}- ${body}`,
      oldPrefixLength,
      newPrefixLength: indentation.length + (isBullet ? 0 : 2),
    };
  }

  return { text: line, oldPrefixLength: 0, newPrefixLength: 0 };
}

function lineBlockEdit(
  text: string,
  from: number,
  to: number,
  command: MarkdownCommand,
): MarkdownEdit {
  const start = from === 0 ? 0 : text.lastIndexOf("\n", from - 1) + 1;
  const selectionEnd = to > from && text[to - 1] === "\n" ? to - 1 : to;
  const foundEnd = text.indexOf("\n", selectionEnd);
  const end = foundEnd === -1 ? text.length : foundEnd;
  const block = text.slice(start, end);

  if (command === "fenced-code") {
    if (from === to) {
      const lineContent = text.slice(start, end);
      const insertion = `\`\`\`\n${lineContent}\n\`\`\``;
      const cursor = start + 4 + Math.min(from - start, lineContent.length);
      return {
        text: text.slice(0, start) + insertion + text.slice(end),
        selectionFrom: cursor,
        selectionTo: cursor,
      };
    }
    const insertion = `\`\`\`\n${block}\n\`\`\``;
    return {
      text: text.slice(0, start) + insertion + text.slice(end),
      selectionFrom: start + 4,
      selectionTo: start + 4 + block.length,
    };
  }

  const lines = block.split("\n");
  const edits = lines.map((line) => prefixLine(line, command));
  const newBlock = edits.map((edit) => edit.text).join("\n");
  const newText = text.slice(0, start) + newBlock + text.slice(end);

  const mapPosition = (position: number): number => {
    if (position < start) return position;
    if (position > end) return position + newBlock.length - block.length;

    let oldLineStart = start;
    let newLineStart = start;
    for (let index = 0; index < edits.length; index += 1) {
      const oldLine = lines[index];
      const edit = edits[index];
      const oldLineEnd = oldLineStart + oldLine.length;
      if (position <= oldLineEnd || index === edits.length - 1) {
        const oldOffset = Math.min(position - oldLineStart, oldLine.length);
        const mappedOffset =
          oldOffset <= edit.oldPrefixLength
            ? edit.newPrefixLength
            : edit.newPrefixLength + oldOffset - edit.oldPrefixLength;
        return newLineStart + Math.min(mappedOffset, edit.text.length);
      }
      oldLineStart = oldLineEnd + 1;
      newLineStart += edit.text.length + 1;
    }
    return start + newBlock.length;
  };

  return {
    text: newText,
    selectionFrom: mapPosition(from),
    selectionTo: mapPosition(to),
  };
}

export function applyMarkdownCommand(
  text: string,
  selectionFrom: number,
  selectionTo: number,
  command: MarkdownCommand,
): MarkdownEdit {
  const from = Math.max(0, Math.min(selectionFrom, text.length));
  const to = Math.max(from, Math.min(selectionTo, text.length));
  return inlineMarkers[command] || command === "link"
    ? inlineEdit(text, from, to, command)
    : lineBlockEdit(text, from, to, command);
}

export function attachmentMarkdown(
  fileName: string,
  relativePath: string,
  isImage: boolean,
): string {
  const escapedName = fileName
    .split("\\")
    .join("\\\\")
    .split("`")
    .join("\\`")
    .split("[")
    .join("\\[")
    .split("]")
    .join("\\]");
  const encodedPath = relativePath
    .split("/")
    .map((segment) => encodeURIComponent(segment).replaceAll("(", "%28").replaceAll(")", "%29"))
    .join("/");
  return isImage ? `![${escapedName}](${encodedPath})` : `[${escapedName}](${encodedPath})`;
}
