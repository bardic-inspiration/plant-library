/**
 * The markdown subset allowed in text fields: paragraphs, emphasis, strong,
 * links, line breaks, and lists. No HTML, headings, images, code blocks,
 * tables, or quotes. `{ref:<type>/<id>}` tokens render as the target's
 * current name, linked.
 */
import { Marked, type Token } from 'marked';

const ALLOWED = new Set(['paragraph', 'text', 'em', 'strong', 'link', 'list', 'list_item', 'space', 'br', 'escape']);

export const REF_TOKEN = /\{ref:([a-z]+\/[a-z0-9]+(?:-[a-z0-9]+)*)\}/g;

const marked = new Marked({ gfm: true, breaks: false });

function walk(tokens: Token[], visit: (t: Token) => void): void {
  for (const t of tokens) {
    visit(t);
    const anyT = t as unknown as { tokens?: Token[]; items?: Token[] };
    if (anyT.tokens) walk(anyT.tokens, visit);
    if (anyT.items) walk(anyT.items, visit);
  }
}

/** Problems that put text outside the subset; empty when it's fine. */
export function subsetProblems(text: string): string[] {
  const problems = new Set<string>();
  walk(marked.lexer(text), (t) => {
    if (!ALLOWED.has(t.type)) problems.add(`${t.type} is not allowed`);
    if (t.type === 'link' && !/^https:\/\//.test((t as { href: string }).href)) problems.add(`link to ${(t as { href: string }).href} must be https`);
  });
  if (/<[a-zA-Z!/]/.test(text)) problems.add('HTML is not allowed');
  return [...problems];
}

/** The keys of every {ref:…} token in a text. */
export function refTokens(text: string): string[] {
  return [...text.matchAll(REF_TOKEN)].map((m) => m[1]);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface RefTarget { name: string; url: string }

/** Render subset text to HTML. `resolve` gives each ref token's current name and URL. */
export function renderMarkdown(text: string, resolve: (key: string) => RefTarget | undefined, inline = false): string {
  const withRefs = text.replace(REF_TOKEN, (_m, key: string) => {
    const t = resolve(key);
    // A placeholder that survives markdown and is swapped for the link afterwards.
    return t ? `\u0000REF:${encodeURIComponent(key)}\u0000` : key;
  });
  const local = new Marked({ gfm: true });
  local.use({
    renderer: {
      html: (t) => escapeHtml(t.text),
      image: (t) => escapeHtml(t.text),
    },
  });
  let html = (inline ? local.parseInline(withRefs) : local.parse(withRefs)) as string;
  html = html.replace(/\u0000REF:([^\u0000]+)\u0000/g, (_m, enc: string) => {
    const key = decodeURIComponent(enc);
    const t = resolve(key)!;
    return `<a href="${escapeHtml(t.url)}">${escapeHtml(t.name)}</a>`;
  });
  return html;
}

/** Plain text of subset markdown, for search and summaries. */
export function plainText(text: string): string {
  return text
    .replace(REF_TOKEN, (_m, key: string) => key.split('/')[1].replace(/-/g, ' '))
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
