import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import stylelint from 'stylelint';
import { contrast, dataRules, resolveColor, rootTokens } from '../lib/contrast';
import { ROOT } from './helpers';
import vocab from '../config/vocab.json' with { type: 'json' };

const T = (f: string) => join(ROOT, 'site/src/styles/tokens', f);
const tokens = rootTokens([T('primitives.css'), T('semantic.css'), T('components.css'), T('content.css')]);
const color = (name: string) => resolveColor(`var(${name})`, tokens);
const WHITE = '#ffffff';
const BLACK = '#000000';

describe('contrast', () => {
  it('text pairs hold 4.5:1', () => {
    for (const [fg, bg] of [['--text', '--bg'], ['--text-muted', '--bg'], ['--text', '--bg-subtle'], ['--text-muted', '--bg-subtle'], ['--text', '--bg-selected'], ['--text-muted', '--bg-selected']]) {
      expect(contrast(color(fg), color(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('rules, focus ring, and the site accent hold 3:1 against white', () => {
    for (const t of ['--rule', '--focus', '--site-accent', '--accent']) expect(contrast(color(t), WHITE), t).toBeGreaterThanOrEqual(3);
  });

  it('every form and project type has an accent, and each holds 3:1 against white', () => {
    const rules = dataRules(T('content.css'));
    const forms = new Set(rules.filter((r) => r.attr === 'form').map((r) => r.value));
    for (const f of vocab.form) expect(forms.has(f.id), `form ${f.id} has an accent`).toBe(true);
    const types = rules.filter((r) => r.attr === 'project-type');
    expect(types.length).toBe(8);
    for (const r of rules.filter((x) => x.attr === 'form' || x.attr === 'project-type')) {
      expect(contrast(resolveColor(r.expr, tokens), WHITE), `${r.attr}=${r.value}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('every bloom color has a swatch, distinguishable from the white ground or its black frame at 3:1', () => {
    const rules = dataRules(T('content.css')).filter((r) => r.attr === 'bloom');
    for (const b of vocab.bloomColor) {
      const r = rules.find((x) => x.value === b.id);
      expect(r, `bloom ${b.id} has a swatch`).toBeDefined();
      const c = resolveColor(r!.expr, tokens);
      expect(Math.max(contrast(c, WHITE), contrast(c, BLACK)), `bloom ${b.id}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('black text holds 4.5:1 on every choropleth step', () => {
    for (let i = 0; i <= 5; i++) expect(contrast(BLACK, color(`--scale-${i}`)), `--scale-${i}`).toBeGreaterThanOrEqual(4.5);
  });
});

describe('Stylelint forbids literals outside tokens/', () => {
  const lint = async (code: string, file = join(ROOT, 'site/src/components/x.css')) => {
    const r = await stylelint.lint({ code, codeFilename: file, configFile: join(ROOT, '.stylelintrc.json') });
    return r.results[0].warnings.map((w) => w.rule);
  };

  it('a hex color', async () => expect(await lint('a { color: #ff0000; }')).toContain('color-no-hex'));
  it('a named color', async () => expect(await lint('a { color: red; }')).toContain('color-named'));
  it('a color function', async () => expect(await lint('a { color: rgb(0 0 0); }')).toContain('function-disallowed-list'));
  it('a length', async () => expect(await lint('a { margin: 12px; }')).toContain('unit-disallowed-list'));
  it('a duration', async () => expect(await lint('a { transition-duration: 200ms; }')).toContain('unit-disallowed-list'));
  it('a font', async () => expect(await lint("a { font-family: 'Helvetica'; }")).toContain('declaration-property-value-allowed-list'));
  it('in an Astro component too', async () => expect(await lint('<style>a { color: #fff; }</style>', join(ROOT, 'site/src/pages/x.astro'))).toContain('color-no-hex'));
  it('tokens may use literals', async () => expect(await lint(':root { --x: #ff0000; --y: 12px; }', T('primitives.css'))).toEqual([]));
  it('tokens through var() pass', async () => expect(await lint('a { color: var(--text); margin: var(--space-md); }')).toEqual([]));
});
