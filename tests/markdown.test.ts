import { describe, expect, it } from 'vitest';
import { plainText, refTokens, renderMarkdown, subsetProblems } from '../lib/markdown';

const resolve = (k: string) => (k === 'plant/acer-circinatum' ? { name: 'Acer circinatum', url: '/plant/acer-circinatum/' } : undefined);

describe('markdown subset', () => {
  it('allows paragraphs, emphasis, https links, and lists', () => {
    expect(subsetProblems('Some *emphasis* and **strong**, a [link](https://example.org).\n\n- one\n- two')).toEqual([]);
  });

  it('rejects headings, HTML, images, code, and plain-http links', () => {
    expect(subsetProblems('# Heading')).toContain('heading is not allowed');
    expect(subsetProblems('<b>bold</b>').length).toBeGreaterThan(0);
    expect(subsetProblems('![x](https://example.org/a.png)')).toContain('image is not allowed');
    expect(subsetProblems('```\ncode\n```')).toContain('code is not allowed');
    expect(subsetProblems('[x](http://example.org)')).toContain('link to http://example.org must be https');
  });

  it('renders ref tokens as linked current names', () => {
    expect(refTokens('See {ref:plant/acer-circinatum}.')).toEqual(['plant/acer-circinatum']);
    expect(renderMarkdown('See {ref:plant/acer-circinatum}.', resolve)).toBe('<p>See <a href="/plant/acer-circinatum/">Acer circinatum</a>.</p>\n');
  });

  it('plain text for search', () => {
    expect(plainText('A *b* [c](https://x.org) {ref:plant/acer-circinatum}')).toBe('A b c acer circinatum');
  });
});
