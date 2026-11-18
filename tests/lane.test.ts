import { describe, expect, it } from 'vitest';
import { checkLane } from '../lib/lane';

describe('lanes', () => {
  it('a content branch may change only content paths', () => {
    expect(checkLane('content/add-salal', ['content/plant/gaultheria-shallon.json', 'assets/images/plant/gaultheria-shallon/1.jpg']).ok).toBe(true);
    const mixed = checkLane('content/add-salal', ['content/plant/gaultheria-shallon.json', 'lib/derive.ts']);
    expect(mixed.ok).toBe(false);
    expect(mixed.errors[0]).toMatch(/only content\/ and assets\/images\/ may change/);
  });

  it('a dev branch may touch content only as a migration, and is labelled so', () => {
    const r = checkLane('dev/rename-field', ['schemas/plant.schema.json', 'content/plant/acer-circinatum.json']);
    expect(r.ok).toBe(true);
    expect(r.labels).toEqual(['data', 'migration']);
  });

  it('the wrong branch prefix fails', () => {
    expect(checkLane('feature/thing', ['lib/derive.ts']).ok).toBe(false);
    expect(checkLane('main', ['lib/derive.ts']).ok).toBe(false);
  });

  it('spike branches can’t merge', () => {
    expect(checkLane('spike/try-deckgl', ['site/src/x.ts']).errors[0]).toMatch(/can't merge/);
  });

  it('a submission branch is content/sub-<id>', () => {
    expect(checkLane('content/sub-20261117T180422Z-7f3a9c', ['content/plant/acer-circinatum.json']).ok).toBe(true);
    expect(checkLane('content/sub-photo', ['content/plant/acer-circinatum.json']).ok).toBe(false);
  });

  it('a session branch takes its lane from its paths', () => {
    expect(checkLane('claude/x', ['content/plant/a.json']).lane).toBe('content');
    expect(checkLane('claude/x', ['lib/a.ts', 'content/plant/a.json']).lane).toBe('dev');
    expect(checkLane('ccr-1a2b-x', ['content/plant/a.json']).lane).toBe('content');
    expect(checkLane('ccr-1a2b-x', ['lib/a.ts']).lane).toBe('dev');
  });

  it('chooses checks: content runs validate and build; dev adds check and test; docs-only runs check', () => {
    expect(checkLane('content/a', ['content/plant/a.json']).checks).toEqual(['validate', 'build']);
    expect(checkLane('dev/a', ['lib/a.ts']).checks).toEqual(['validate', 'build', 'check', 'test']);
    const docs = checkLane('dev/a', ['docs/site.md', 'README.md']);
    expect(docs.docsOnly).toBe(true);
    expect(docs.checks).toEqual(['check']);
  });

  it('labels areas by path', () => {
    expect(checkLane('dev/a', ['site/src/pages/index.astro', '.github/workflows/validate.yml', 'geo/states.json']).labels).toEqual(['ci', 'map', 'ui']);
  });
});
