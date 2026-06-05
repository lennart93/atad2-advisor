import { describe, it, expect } from 'vitest';
import { rtfToText, looksLikeRtf } from '../rtfToText';

// RTF inputs use String.raw so the many backslashes stay literal.
const R = String.raw;

describe('rtfToText', () => {
  it('extracts plain body text', () => {
    expect(rtfToText(R`{\rtf1\ansi\deff0 Hello World}`)).toBe('Hello World');
  });

  it('turns \\par into a newline', () => {
    expect(rtfToText(R`{\rtf1 Line one\par Line two}`)).toBe('Line one\nLine two');
  });

  it('turns \\line into a newline', () => {
    expect(rtfToText(R`{\rtf1 a\line b}`)).toBe('a\nb');
  });

  it('unescapes backslash and braces', () => {
    expect(rtfToText(R`{\rtf1 a\{b\}c\\d}`)).toBe('a{b}c\\d');
  });

  it('keeps text inside formatting groups but drops the formatting', () => {
    expect(rtfToText(R`{\rtf1 {\b Bold} normal}`)).toBe('Bold normal');
  });

  it('decodes \\\'xx hex escapes via Windows-1252 (accents)', () => {
    expect(rtfToText(R`{\rtf1 caf\'e9}`)).toBe('café');
  });

  it('decodes the cp1252 0x80-0x9F special range', () => {
    // \'93 -> U+201C left double quote, \'94 -> U+201D right double quote
    expect(rtfToText(R`{\rtf1 \'93Hi\'94}`)).toBe('“Hi”');
    // \'80 -> euro sign
    expect(rtfToText(R`{\rtf1 \'80100}`)).toBe('€100');
  });

  it('decodes \\uN unicode escapes and skips one fallback char by default', () => {
    expect(rtfToText(R`{\rtf1 caf\u233 ?}`)).toBe('café');
  });

  it('skips a \\\'xx fallback after \\uN', () => {
    expect(rtfToText(R`{\rtf1 caf\u233\'3f}`)).toBe('café');
  });

  it('honours \\ucN fallback skip count', () => {
    expect(rtfToText(R`{\rtf1 \uc2\u233 ??X}`)).toBe('éX');
  });

  it('honours \\uc0 (no fallback to skip)', () => {
    expect(rtfToText(R`{\rtf1 \uc0\u233 X}`)).toBe('éX');
  });

  it('handles negative \\uN by wrapping into the 16-bit range', () => {
    // -57172 + 65536 = 8364 = euro sign
    expect(rtfToText(R`{\rtf1 \u-57172 ?}`)).toBe('€');
  });

  it('drops the font table', () => {
    expect(rtfToText(R`{\rtf1{\fonttbl{\f0\froman Times;}}Body text}`)).toBe('Body text');
  });

  it('drops the colour table', () => {
    expect(rtfToText(R`{\rtf1{\colortbl;\red0\green0\blue0;}Body}`)).toBe('Body');
  });

  it('drops the \\info group', () => {
    expect(rtfToText(R`{\rtf1{\info{\title Secret}}Visible}`)).toBe('Visible');
  });

  it('drops ignorable (\\*) destinations', () => {
    expect(rtfToText(R`{\rtf1{\*\generator Riched20 10.0}Body}`)).toBe('Body');
  });

  it('renders table cells as tabs and rows as newlines', () => {
    expect(rtfToText(R`{\rtf1 A\cell B\cell\row}`)).toBe('A\tB');
  });

  it('skips \\binN raw bytes', () => {
    expect(rtfToText(R`{\rtf1 A\bin3 XYZB}`)).toBe('AB');
  });

  it('returns empty string for a document with no body text', () => {
    expect(rtfToText(R`{\rtf1{\fonttbl{\f0 Arial;}}}`)).toBe('');
  });

  it('collapses excess blank lines and trims', () => {
    expect(rtfToText(R`{\rtf1 \par\par A\par\par\par B\par\par}`)).toBe('A\n\nB');
  });

  it('parses a realistic multi-part document', () => {
    const rtf = R`{\rtf1\ansi\ansicpg1252\deff0{\fonttbl{\f0\fswiss Arial;}}` +
      R`{\colortbl ;\red0\green0\blue0;}` +
      R`{\*\generator Riched20 10.0.19041}` +
      R`\viewkind4\uc1\pard\f0\fs20 Kynexis B.V.\par CIT return 2024\par Result: \'80 1.234\par}`;
    expect(rtfToText(rtf)).toBe('Kynexis B.V.\nCIT return 2024\nResult: € 1.234');
  });
});

// Hardening cases derived from an adversarial review of the parser.
describe('rtfToText hardening', () => {
  it('throws on unbalanced braces (truncated / malformed document)', () => {
    // The \info group is never closed, so its ignore flag would otherwise leak
    // and silently swallow the body paragraphs.
    expect(() => rtfToText(R`{\rtf1 Header line\par {\info{\author X} Body one\par Body two}`))
      .toThrow(/malformed|unbalanced|truncated/i);
  });

  it('does not let an inline destination word blank the rest of a paragraph', () => {
    expect(rtfToText(R`{\rtf1 Hello \fonttbl world}`)).toBe('Hello world');
  });

  it('does not let an inline \\* blank the rest of a paragraph', () => {
    expect(rtfToText(R`{\rtf1 Keep1\*\bkmkstart Keep2}`)).toBe('Keep1Keep2');
  });

  it('still strips a properly grouped \\* destination', () => {
    expect(rtfToText(R`{\rtf1 Body {\*\bkmkstart x}more}`)).toBe('Body more');
  });

  it('strips field instructions but keeps the field result', () => {
    expect(rtfToText(R`{\rtf1 {\field{\fldinst HYPERLINK "http://secret"}{\fldrslt Click}}}`)).toBe('Click');
  });

  it('clamps an out-of-range \\uN instead of throwing, and keeps extracting', () => {
    // Build with an explicit backslash so the source has no literal \u escape.
    const bs = String.fromCharCode(92);
    const rtf = `{${bs}rtf1 First${bs}par X${bs}u99999999 Y${bs}par Last}`;
    expect(rtfToText(rtf)).toBe('First\nX\nLast');
  });

  it('honours \\ansicpg for non-1252 \\\'xx decoding', () => {
    // cp1251 byte 0xE8 -> Cyrillic small "и" (U+0438), not cp1252 "è".
    expect(rtfToText(R`{\rtf1\ansicpg1251 \'e8}`)).toBe('и');
  });

  it('drops a destination group even when whitespace precedes the keyword', () => {
    // The space after "{" must NOT count as body text and defeat the guard.
    expect(rtfToText(R`{\rtf1 A{ \fonttbl{\f0 Times New Roman;}}B}`)).toBe('A B');
    expect(rtfToText(R`{\rtf1 A{ \info{\author Bob}}B}`)).toBe('A B');
  });

  it('decodes multi-byte code pages (GBK / Shift-JIS) as whole sequences', () => {
    expect(rtfToText(R`{\rtf1\ansicpg936 \'c4\'e3}`)).toBe('你');
    expect(rtfToText(R`{\rtf1\ansicpg932 \'82\'a0}`)).toBe('あ');
  });

  it('falls back to cp1252 for an unknown \\ansicpg code page', () => {
    expect(rtfToText(R`{\rtf1\ansicpg99999 caf\'e9}`)).toBe('café');
  });
});

describe('looksLikeRtf', () => {
  it('accepts genuine RTF (incl. leading whitespace)', () => {
    expect(looksLikeRtf(R`{\rtf1\ansi\deff0 Hi}`)).toBe(true);
    expect(looksLikeRtf('   {\\rtf1 Hi}')).toBe(true);
  });

  it('rejects plain text, mojibake and renamed files', () => {
    expect(looksLikeRtf('Just a plain memo')).toBe(false);
    expect(looksLikeRtf(R`C:\Users\tax\client.txt`)).toBe(false);
    expect(looksLikeRtf('â¬ Net interest 1.234')).toBe(false); // UTF-8 euro read as latin1
  });
});
