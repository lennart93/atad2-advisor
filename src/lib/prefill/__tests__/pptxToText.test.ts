import { describe, it, expect } from 'vitest';
import { pptxSlideToText, pptxToText } from '../pptxToText';

describe('pptxSlideToText', () => {
  it('joins runs within a paragraph, newlines between paragraphs', () => {
    const xml =
      '<a:p><a:r><a:t>Hello </a:t></a:r><a:r><a:t>world</a:t></a:r></a:p>' +
      '<a:p><a:t>Second line</a:t></a:p>';
    expect(pptxSlideToText(xml)).toBe('Hello world\nSecond line');
  });

  it('decodes XML entities', () => {
    expect(pptxSlideToText('<a:p><a:t>A &amp; B &lt;C&gt; &#233;</a:t></a:p>')).toBe('A & B <C> é');
  });

  it('ignores empty paragraphs', () => {
    expect(pptxSlideToText('<a:p></a:p><a:p><a:t>X</a:t></a:p>')).toBe('X');
  });
});

describe('pptxToText (round-trip via pizzip)', () => {
  it('extracts slides in numeric order (slide10 after slide2)', async () => {
    const PizZip = (await import('pizzip')).default;
    const zip = new PizZip();
    zip.file('ppt/slides/slide1.xml', '<a:p><a:t>First</a:t></a:p>');
    zip.file('ppt/slides/slide2.xml', '<a:p><a:t>Second</a:t></a:p>');
    zip.file('ppt/slides/slide10.xml', '<a:p><a:t>Tenth</a:t></a:p>');
    zip.file('ppt/presentation.xml', '<p:presentation/>'); // non-slide part, ignored
    const buf = zip.generate({ type: 'arraybuffer' });

    expect(await pptxToText(buf)).toBe('First\n\nSecond\n\nTenth');
  });

  it('returns the empty string for a deck with no text', async () => {
    const PizZip = (await import('pizzip')).default;
    const zip = new PizZip();
    zip.file('ppt/slides/slide1.xml', '<a:p></a:p>');
    const buf = zip.generate({ type: 'arraybuffer' });

    expect(await pptxToText(buf)).toBe('');
  });
});
