import type { Root, Element, ElementContent, Properties } from "hast";

/**
 * Security hardening for memo rendering.
 *
 * The memo is rendered with `rehype-raw` so the model's inline formatting tags
 * (`<u>`, `<sup>`, `<sub>`, `<br>`) survive, since Markdown has no syntax for
 * them. `rehype-raw` turns ANY raw HTML in the memo into real DOM nodes, and the
 * memo text is derived from user-uploaded documents and per-paragraph feedback,
 * so it is attacker-influenceable. Without a sanitizing pass an injected
 * `<svg><script>…</script></svg>` or `<iframe srcdoc="…">` executes and can read
 * the Supabase session token from localStorage (account/session takeover).
 *
 * This rehype plugin runs AFTER `rehype-raw` and strips every element and
 * attribute that is not on a strict formatting allowlist. It is self-contained
 * (no `rehype-sanitize` dependency) and operates on the parsed HAST tree, so
 * ordinary memo text that happens to contain `<` or `>` is already a text node
 * by this point and is left untouched.
 */

// Elements whose entire subtree is removed (content included). These are the
// script carriers and framing/exfiltration vectors — `<svg>` because an
// SVG-namespaced `<script>` executes on insertion, `<iframe srcdoc>` because a
// same-origin srcdoc frame can reach `parent.localStorage`.
const DROP_SUBTREE = new Set<string>([
  "script", "style", "iframe", "object", "embed", "svg", "math", "form",
  "link", "meta", "base", "template", "noscript", "title", "input", "button",
  "textarea", "select", "option", "audio", "video", "source", "track", "canvas",
  "frame", "frameset", "applet", "portal",
]);

// Formatting/structure tags we keep. Anything not here and not in DROP_SUBTREE
// is unwrapped: the wrapper is discarded but its (already-sanitized) children
// are preserved, so unexpected-but-harmless tags never silently eat content.
const ALLOWED = new Set<string>([
  "p", "br", "hr", "span", "div",
  "strong", "b", "em", "i", "u", "s", "del", "ins", "mark", "small", "sub", "sup",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "blockquote", "code", "pre",
  "a",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th",
]);

// Attributes allowed to survive on a kept element (plus `href` on <a>, handled
// separately with a protocol check). Everything else — every `on*` handler,
// `style`, `src`, `srcdoc`, `formaction`, `xlink:href`, etc. — is dropped.
const ALLOWED_ATTRS = new Set<string>([
  "classname", "class", "id", "colspan", "rowspan", "align", "start", "type",
]);

const SAFE_HREF = /^(https?:|mailto:|tel:|#|\/)/i;

function sanitizeProps(tag: string, props: Properties | undefined): Properties {
  const out: Properties = {};
  if (!props) return out;
  for (const [key, value] of Object.entries(props)) {
    const k = key.toLowerCase();
    if (tag === "a" && k === "href") {
      const v = String(value ?? "").trim();
      if (SAFE_HREF.test(v)) out[key] = value; // drops javascript:/data: URLs
      continue;
    }
    if (ALLOWED_ATTRS.has(k)) out[key] = value;
    // Anything else (on*, style, src, srcdoc, formaction, xlink:href, …) dropped.
  }
  return out;
}

type ParentNode = Root | Element;

function sanitizeChildren(node: ParentNode): void {
  const children = node.children as ElementContent[] | undefined;
  if (!Array.isArray(children)) return;
  const kept: ElementContent[] = [];
  for (const child of children) {
    if (child.type === "element") {
      const tag = String(child.tagName || "").toLowerCase();
      if (DROP_SUBTREE.has(tag)) continue; // remove element and everything inside
      child.properties = sanitizeProps(tag, child.properties);
      sanitizeChildren(child); // recurse before deciding keep vs unwrap
      if (ALLOWED.has(tag)) {
        kept.push(child);
      } else {
        // Unknown but non-dangerous: drop wrapper, keep sanitized children.
        kept.push(...((child.children as ElementContent[]) ?? []));
      }
    } else if (child.type === "text") {
      kept.push(child);
    }
    // Comment / raw / doctype nodes are dropped.
  }
  node.children = kept;
}

/**
 * Rehype plugin: place AFTER `rehype-raw` in the plugin list.
 * See `MEMO_REHYPE_PLUGINS` in `memoProse.tsx` for the shared hardened config.
 */
export function rehypeSanitizeMemo() {
  return (tree: Root): void => sanitizeChildren(tree);
}
