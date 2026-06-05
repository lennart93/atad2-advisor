// Dependency-free RTF -> plain-text extractor.
//
// RTF is 7-bit ASCII with backslash control words, brace-delimited groups, and
// \'xx / \uN escapes for non-ASCII characters. The browser has no native RTF
// reader and no bundled library handles it cleanly under Vite, so we parse it
// ourselves. We only need readable text for the LLM prefill, not layout
// fidelity: we drop font/colour/style tables, pictures, objects and any
// ignorable (\*) destination, keep paragraph/table structure as newlines and
// tabs, and decode characters via the document code page (\ansicpg, default
// Windows-1252 which covers the Western-European accents in Dutch tax docs).
//
// Decode the file bytes as latin1 (1 byte -> 1 char) before calling this so
// \'xx byte values and \binN byte counts stay exact. Validate that the input is
// actually RTF with looksLikeRtf() first; rtfToText assumes well-formed-ish RTF
// and fails closed (throws) on unbalanced braces rather than returning a
// silently-truncated document.

// Windows-1252 mappings for the 0x80-0x9F range, where cp1252 diverges from
// Latin-1. Outside this range cp1252 == Latin-1 == the Unicode code point.
const CP1252_HIGH: Record<number, string> = {
  0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„",
  0x85: "…", 0x86: "†", 0x87: "‡", 0x88: "ˆ",
  0x89: "‰", 0x8a: "Š", 0x8b: "‹", 0x8c: "Œ",
  0x8e: "Ž", 0x91: "‘", 0x92: "’", 0x93: "“",
  0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—",
  0x98: "˜", 0x99: "™", 0x9a: "š", 0x9b: "›",
  0x9c: "œ", 0x9e: "ž", 0x9f: "Ÿ",
};

function decodeCp1252(byte: number): string {
  if (byte < 0x80 || byte > 0x9f) return String.fromCharCode(byte);
  return CP1252_HIGH[byte] ?? "";
}

// \ansicpg code-page numbers -> WHATWG TextDecoder labels. The multi-byte East
// Asian pages need their own labels (not "windows-NNN", which is unregistered);
// the single-byte pages use the valid "windows-NNN" aliases. Anything not listed
// falls back to "windows-<cp>" then cp1252.
const CP_LABELS: Record<number, string> = {
  874: "windows-874", 932: "shift_jis", 936: "gbk", 949: "euc-kr", 950: "big5",
  1250: "windows-1250", 1251: "windows-1251", 1253: "windows-1253",
  1254: "windows-1254", 1255: "windows-1255", 1256: "windows-1256",
  1257: "windows-1257", 1258: "windows-1258",
};

// Control words that open a non-body destination group. They are always used
// as the first token of their own {group}, so marking a FRESH group ignored on
// sight is safe and skips the whole subtree. fldinst holds field instructions
// (hyperlink URLs, PAGE refs) that should not leak into the text.
const DESTINATIONS = new Set<string>([
  "fonttbl", "filetbl", "colortbl", "stylesheet", "listtable",
  "listoverridetable", "revtbl", "rsidtbl", "info", "pict", "object",
  "objdata", "themedata", "colorschememapping", "latentstyles", "datastore",
  "generator", "xmlnstbl", "wgrffmtfilter", "pgptbl", "mmathPr", "operator",
  "fldinst",
]);

// Control words that emit a literal character or whitespace.
const SYMBOLS: Record<string, string> = {
  par: "\n", sect: "\n", page: "\n", line: "\n", softline: "\n",
  tab: "\t", cell: "\t", nestcell: "\t", row: "\n", nestrow: "\n",
  emdash: "—", endash: "–", bullet: "•",
  lquote: "‘", rquote: "’", ldblquote: "“", rdblquote: "”",
  emspace: " ", enspace: " ", qmspace: " ",
};

interface GroupState {
  uc: number;       // \ucN: how many fallback chars follow each \uN
  ignore: boolean;  // inside a skipped destination?
  sawText: boolean; // has any non-whitespace text been emitted in this group yet?
}

/**
 * Cheap structural check that the input is really an RTF document. Genuine RTF
 * always begins with the "{\rtf" signature; a plain-text or UTF-8 file merely
 * renamed .rtf will not, and must not be fed through the parser (it would be
 * silently mangled / mojibaked).
 */
export function looksLikeRtf(raw: string): boolean {
  return /^\s*\{\\rtf/.test(raw);
}

/**
 * Convert an RTF document (already decoded to a latin1 string) into plain text.
 * Returns the empty string for input that yields no body text. Throws on
 * unbalanced braces (a truncated / corrupt document) so the caller can reject
 * the upload rather than pass a silently-truncated document downstream.
 */
export function rtfToText(rtf: string): string {
  const out: string[] = [];
  const stack: GroupState[] = [{ uc: 1, ignore: false, sawText: false }];
  const top = () => stack[stack.length - 1];
  // Only NON-whitespace marks a group as having body text. Otherwise a space or
  // \par emitted before a destination keyword (e.g. "{ \fonttbl...}") would
  // defeat the destination guard and leak the table's contents.
  const emit = (s: string) => {
    if (!top().ignore) {
      out.push(s);
      if (!top().sawText && /\S/.test(s)) top().sawText = true;
    }
  };

  // \'xx code page. Defaults to Windows-1252; \ansicpg can switch it. Consecutive
  // \'xx bytes are decoded together so multi-byte pages (Shift-JIS, GBK, Big5)
  // assemble correctly; an unknown label falls back to cp1252.
  let codePage = 1252;
  const decoders = new Map<number, TextDecoder | null>();
  const getDecoder = (cp: number): TextDecoder | null => {
    if (!decoders.has(cp)) {
      const label = CP_LABELS[cp] ?? `windows-${cp}`;
      let dec: TextDecoder | null = null;
      try { dec = new TextDecoder(label, { fatal: false }); } catch { dec = null; }
      decoders.set(cp, dec);
    }
    return decoders.get(cp) ?? null;
  };
  const decodeBytes = (bytes: number[]): string => {
    if (codePage === 1252) return bytes.map(decodeCp1252).join("");
    const dec = getDecoder(codePage);
    return dec ? dec.decode(new Uint8Array(bytes)) : bytes.map(decodeCp1252).join("");
  };

  const n = rtf.length;
  let i = 0;

  // After a \uN char, skip `count` characters of ANSI fallback. A \'xx escape
  // counts as one skipped char; a literal char counts as one. Stop at group
  // boundaries so we never skip across {} structure.
  const skipUnicodeFallback = (count: number) => {
    let skipped = 0;
    while (skipped < count && i < n) {
      const c = rtf[i];
      if (c === "{" || c === "}") break;
      if (c === "\\") {
        if (rtf[i + 1] === "'") { i += 4; skipped++; continue; }
        break; // a control word as fallback is unexpected; leave it for the loop
      }
      i++; skipped++;
    }
  };

  while (i < n) {
    const c = rtf[i];

    if (c === "{") {
      const parent = top();
      stack.push({ uc: parent.uc, ignore: parent.ignore, sawText: false });
      i++;
      continue;
    }
    if (c === "}") {
      if (stack.length > 1) stack.pop();
      i++;
      continue;
    }
    if (c === "\r" || c === "\n") { i++; continue; } // source breaks are not text

    if (c !== "\\") { emit(c); i++; continue; }

    // From here on: a backslash escape, control symbol, or control word.
    const next = rtf[i + 1];
    if (next === undefined) { i++; continue; }

    if (next === "\\" || next === "{" || next === "}") { emit(next); i += 2; continue; }
    if (next === "*") {
      // \* marks an ignorable destination, but only when it opens a fresh group
      // (before any text). Guard against malformed inline \* that would
      // otherwise blank the rest of a paragraph.
      if (!top().sawText) top().ignore = true;
      i += 2;
      continue;
    }
    if (next === "'") {
      // Consume a run of consecutive \'xx bytes and decode them together so
      // multi-byte code pages assemble correctly.
      const bytes: number[] = [];
      while (rtf[i] === "\\" && rtf[i + 1] === "'") {
        const b = parseInt(rtf.substr(i + 2, 2), 16);
        i += 4;
        if (!Number.isNaN(b)) bytes.push(b);
      }
      if (bytes.length) emit(decodeBytes(bytes));
      continue;
    }
    if (next === "_") { emit("-"); i += 2; continue; }   // non-breaking hyphen
    if (next === "-") { i += 2; continue; }              // optional hyphen -> nothing
    if (!/[a-zA-Z]/.test(next)) {
      if (next === "~") { emit(" "); } // non-breaking space; other symbols ignored
      i += 2;
      continue;
    }

    // Control word: letters, then an optional signed integer, then one
    // optional space delimiter (which is consumed, per the RTF spec).
    let j = i + 1;
    while (j < n && /[a-zA-Z]/.test(rtf[j])) j++;
    const word = rtf.slice(i + 1, j);
    let param = "";
    if (rtf[j] === "-") { param = "-"; j++; }
    while (j < n && rtf[j] >= "0" && rtf[j] <= "9") { param += rtf[j]; j++; }
    if (rtf[j] === " ") j++;
    i = j;

    if (word === "ansicpg") {
      const cp = parseInt(param, 10);
      if (!Number.isNaN(cp) && cp > 0) codePage = cp;
      continue;
    }
    if (word === "uc") {
      const v = parseInt(param || "1", 10);
      top().uc = Number.isNaN(v) ? 1 : v;
      continue;
    }
    if (word === "u") {
      let code = parseInt(param, 10);
      if (Number.isNaN(code)) continue;
      if (code < 0) code += 65536;
      // Clamp: a corrupt/hostile \uN above U+10FFFF would make String.fromCodePoint
      // throw and abort the whole extraction. Skip it, but still consume the
      // ANSI fallback so surrounding text stays aligned.
      if (code >= 0 && code <= 0x10ffff) emit(String.fromCodePoint(code));
      skipUnicodeFallback(top().uc);
      continue;
    }
    if (word === "bin") {
      // Skip raw binary bytes. A blind index jump is correct for spec-valid RTF
      // (the payload is exactly N bytes and may itself contain { } bytes, so we
      // must NOT stop at braces). A corrupt/inflated count that overruns real
      // structure is caught by the unbalanced-brace guard below.
      const cnt = parseInt(param, 10);
      if (!Number.isNaN(cnt) && cnt > 0) i = Math.min(i + cnt, n);
      continue;
    }
    if (word in SYMBOLS) { emit(SYMBOLS[word]); continue; }
    if (DESTINATIONS.has(word)) { if (!top().sawText) top().ignore = true; continue; }
    // Any other control word is formatting we don't render: ignore it.
  }

  // Unbalanced braces mean an unclosed destination group suppressed real body
  // text, or the file was truncated. Fail closed rather than returning a
  // silently-partial document.
  if (stack.length > 1) {
    throw new Error(
      "This RTF file looks malformed or truncated (unbalanced braces). Re-save it from your editor and upload it again.",
    );
  }

  return out
    .join("")
    // Strip stray C0 control chars (keep \t and \n) that \'xx escapes can emit.
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/[ \t]+\n/g, "\n")                    // trailing whitespace per line
    .replace(/\n{3,}/g, "\n\n")                    // collapse runs of blank lines
    .trim();
}
