import { describe, expect, it } from 'vitest';
import { toBlocks } from '@/lib/wordpress';

describe('toBlocks', () => {
  it('converts headings to WordPress heading blocks at the right level', () => {
    const out = toBlocks('## What is this?\n\n### A detail');
    expect(out).toContain('<!-- wp:heading {"level":2} -->');
    expect(out).toContain('<h2>What is this?</h2>');
    expect(out).toContain('<!-- wp:heading {"level":3} -->');
    expect(out).toContain('<h3>A detail</h3>');
  });

  it('wraps prose in paragraph blocks', () => {
    const out = toBlocks('Just a sentence.');
    expect(out).toContain('<!-- wp:paragraph -->');
    expect(out).toContain('<p>Just a sentence.</p>');
  });

  it('joins wrapped lines into one paragraph', () => {
    expect(toBlocks('one line\nsecond line')).toContain('<p>one line second line</p>');
  });

  it('converts bullet and numbered lists', () => {
    const bullets = toBlocks('- alpha\n- beta');
    expect(bullets).toContain('<!-- wp:list -->');
    expect(bullets).toContain('<li>alpha</li>');

    const ordered = toBlocks('1. first\n2. second');
    expect(ordered).toContain('<!-- wp:list {"ordered":true} -->');
    expect(ordered).toContain('<li>first</li>');
  });

  it('converts blockquotes', () => {
    expect(toBlocks('> quoted line')).toContain('<!-- wp:quote -->');
  });

  it('renders bold, italic and links', () => {
    const out = toBlocks('This is **bold**, this is *italic*, and [a link](https://example.com).');
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<em>italic</em>');
    expect(out).toContain('<a href="https://example.com">a link</a>');
  });

  it('escapes HTML so pasted markup cannot inject into the post', () => {
    const out = toBlocks('Watch out <script>alert(1)</script> here');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('escapes ampersands without breaking generated links', () => {
    const out = toBlocks('Tom & Jerry, see [docs](https://example.com/a?b=1&c=2).');
    expect(out).toContain('Tom &amp; Jerry');
    expect(out).toContain('href="https://example.com/a?b=1&amp;c=2"');
  });

  it('drops blank blocks and returns empty for empty input', () => {
    expect(toBlocks('')).toBe('');
    expect(toBlocks('\n\n   \n\n')).toBe('');
  });

  it('keeps every block separated so WordPress parses them individually', () => {
    const out = toBlocks('## Heading\n\nParagraph.\n\n- item');
    expect(out.match(/<!-- wp:/g)?.length).toBe(3);
  });
});
