import { describe, expect, it } from "vitest";
import { isExternalWebLink, markdownHeadingBase } from "./markdown-link-validation";

describe("external Markdown link validation", () => {
  it("allows only credential-free HTTP and HTTPS URLs", () => {
    expect(isExternalWebLink("https://example.test/path")).toBe(true);
    expect(isExternalWebLink("http://example.test")).toBe(true);
    expect(isExternalWebLink("https://user:secret@example.test")).toBe(false);
    expect(isExternalWebLink("javascript:alert(1)")).toBe(false);
    expect(isExternalWebLink("file:///etc/passwd")).toBe(false);
    expect(isExternalWebLink("//example.test/path")).toBe(false);
    expect(isExternalWebLink("#heading")).toBe(false);
  });
});

describe("Markdown heading fragments", () => {
  it("normalizes readable fragments to the preview heading id", () => {
    expect(markdownHeadingBase("A heading with café")).toBe("a-heading-with-cafe");
    expect(markdownHeadingBase("Repeated heading-1")).toBe("repeated-heading-1");
  });
});
