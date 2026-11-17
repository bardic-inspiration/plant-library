import { describe, expect, it } from 'vitest';
import { githubSlug, markdownAnchors, checkMarkdown } from '../lib/links';
import { ROOT } from './helpers';

describe('links', () => {
  it('makes GitHub heading anchors', () => {
    expect(githubSlug('Prototype and handover')).toBe('prototype-and-handover');
    expect(githubSlug('The `integrate` skill')).toBe('the-integrate-skill');
    expect([...markdownAnchors('# A\n## A\n```\n# not\n```')]).toEqual(['a', 'a-1']);
  });

  it('every relative Markdown link in the repo resolves', () => {
    expect(checkMarkdown(ROOT)).toEqual([]);
  });
});
