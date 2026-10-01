import { isValidElement, type ComponentProps, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownHeadingBase } from "../features/workspace/markdown-link-validation";

interface MarkdownPreviewProps {
  content: string;
  onOpenLink: (href: string) => void;
}

function textContent(value: ReactNode): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textContent).join("");
  if (isValidElement(value)) return textContent(value.props.children as ReactNode);
  return "";
}

function headingSlug(value: ReactNode, counts: Map<string, number>): string {
  const base = markdownHeadingBase(textContent(value));
  const count = counts.get(base) ?? 0;
  counts.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}

export function MarkdownPreview({ content, onOpenLink }: MarkdownPreviewProps) {
  const components: Components = (() => {
    const headingCounts = new Map<string, number>();
    const heading = (tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") => {
      const Component = tag;
      return ({ children, ...props }: ComponentProps<typeof Component>) => (
        <Component {...props} id={headingSlug(children, headingCounts)}>
          {children}
        </Component>
      );
    };

    return {
      a: ({ href, children, ...props }) => (
        <a
          {...props}
          href={href}
          onClick={(event) => {
            event.preventDefault();
            if (href) onOpenLink(href);
          }}
        >
          {children}
        </a>
      ),
      img: ({ alt }) => (
        <span
          className="markdown-image-placeholder"
          aria-label={`Image preview disabled: ${alt ?? "image"}`}
        >
          Image preview disabled{alt ? `: ${alt}` : ""}
        </span>
      ),
      h1: heading("h1"),
      h2: heading("h2"),
      h3: heading("h3"),
      h4: heading("h4"),
      h5: heading("h5"),
      h6: heading("h6"),
    };
  })();

  return (
    <div className="markdown-preview" aria-label="Markdown preview">
      <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
