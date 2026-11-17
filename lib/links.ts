/**
 * Link checks (P8): relative links in the repo's Markdown, and internal
 * links in the built site. Node only.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

export interface LinkProblem { file: string; link: string; message: string }

/** GitHub's heading anchor: lowercase, punctuation dropped, spaces to hyphens. */
export function githubSlug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-');
}

export function markdownAnchors(text: string): Set<string> {
  const out = new Set<string>();
  const counts = new Map<string, number>();
  let inFence = false;
  for (const line of text.split('\n')) {
    if (/^```/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const m = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const base = githubSlug(m[1]);
    const n = counts.get(base) ?? 0;
    out.add(n ? `${base}-${n}` : base);
    counts.set(base, n + 1);
  }
  return out;
}

function walk(dir: string, filter: (f: string) => boolean, skip: Set<string>, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, filter, skip, out);
    else if (filter(p)) out.push(p);
  }
  return out;
}

/** Relative links and anchors in every Markdown file outside dependencies and build output. */
export function checkMarkdown(root: string): LinkProblem[] {
  const skip = new Set(['node_modules', '.git', 'dist', '.astro', 'public', 'test-results', 'snapshots', 'inbox', 'processed']);
  const problems: LinkProblem[] = [];
  const cache = new Map<string, Set<string>>();
  const anchorsOf = (f: string) => {
    if (!cache.has(f)) cache.set(f, markdownAnchors(readFileSync(f, 'utf8')));
    return cache.get(f)!;
  };
  for (const file of walk(root, (f) => f.endsWith('.md'), skip)) {
    const rel = relative(root, file);
    const text = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
    for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const link = m[1];
      if (/^(https?:|mailto:)/.test(link)) continue;
      const [path, anchor] = link.split('#');
      const target = path ? resolve(dirname(file), decodeURIComponent(path)) : file;
      if (!existsSync(target)) {
        problems.push({ file: rel, link, message: 'target does not exist' });
        continue;
      }
      if (anchor && target.endsWith('.md') && !anchorsOf(target).has(anchor)) problems.push({ file: rel, link, message: `no heading #${anchor}` });
    }
  }
  return problems;
}

/** Every internal href and src in the built site resolves, and goes through the base path. */
export function checkSite(dist: string, base: string): LinkProblem[] {
  const problems: LinkProblem[] = [];
  if (!existsSync(dist)) return problems;
  const ids = new Map<string, Set<string>>();
  const pages = walk(dist, (f) => f.endsWith('.html'), new Set());
  const idsOf = (f: string) => {
    if (!ids.has(f)) ids.set(f, new Set([...readFileSync(f, 'utf8').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
    return ids.get(f)!;
  };
  for (const page of pages) {
    const rel = relative(dist, page);
    const html = readFileSync(page, 'utf8');
    for (const m of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
      const link = m[1].replace(/&amp;/g, '&');
      if (/^(https?:|mailto:|data:|javascript:)/.test(link)) continue;
      if (link.startsWith('#')) {
        if (link.length > 1 && !idsOf(page).has(decodeURIComponent(link.slice(1)))) problems.push({ file: rel, link, message: 'no element with that id' });
        continue;
      }
      if (!link.startsWith('/')) {
        problems.push({ file: rel, link, message: 'internal links are absolute and go through the base path' });
        continue;
      }
      if (!link.startsWith(base)) {
        problems.push({ file: rel, link, message: `does not go through the base path ${base}` });
        continue;
      }
      const [pathQ, anchor] = link.split('#');
      const path = decodeURIComponent(pathQ.split('?')[0].slice(base.length));
      let target = join(dist, path);
      if (existsSync(target) && statSync(target).isDirectory()) target = join(target, 'index.html');
      if (!existsSync(target)) {
        problems.push({ file: rel, link, message: 'no such page or file' });
        continue;
      }
      if (anchor && target.endsWith('.html') && !idsOf(target).has(anchor)) problems.push({ file: rel, link, message: `no element #${anchor}` });
    }
  }
  return problems;
}
