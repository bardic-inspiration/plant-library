import { describe, expect, it } from 'vitest';
import { entry, messages, setup, validateWith } from './helpers';
import { validateConfig } from '../lib/validate';
import type { Entry, PlantData } from '../lib/types';

const plant = (es: Parameters<Parameters<typeof validateWith>[0]>[0], id: string) => entry(es, `plant/${id}`).entry as unknown as Entry<PlantData>;
const expectError = (r: ReturnType<typeof validateWith>, pattern: RegExp) => expect(messages(r).some((m) => pattern.test(m)), messages(r).join('\n') || '(no errors)').toBe(true);

describe('the fixture library', () => {
  it('passes validation, with warnings only for missing images', () => {
    const r = validateWith(() => {});
    expect(messages(r)).toEqual([]);
    expect(r.warnings.map((w) => w.message)).toEqual(['has no image', 'has no image']);
  });

  it('config passes its schemas', () => {
    const { config, schemas } = setup();
    expect(validateConfig(config, schemas).errors).toEqual([]);
  });
});

describe('envelope and schema', () => {
  it('rejects unknown top-level keys', () => {
    expectError(validateWith((es) => Object.assign(plant(es, 'acer-circinatum'), { colour: 'red' })), /unknown key "colour"/);
  });

  it('rejects unknown data keys', () => {
    expectError(validateWith((es) => Object.assign(plant(es, 'acer-circinatum').data, { flowerColour: 'red' })), /data: unknown key "flowerColour"/);
  });

  it('rejects values outside the vocabulary', () => {
    expectError(validateWith((es) => (plant(es, 'acer-circinatum').data.form = 'cactus')), /data\/form: must be one of/);
  });

  it('requires the path to match type and id', () => {
    expectError(
      validateWith((es) => (entry(es, 'plant/acer-circinatum').file = 'content/plant/vine-maple.json')),
      /path must be content\/plant\/acer-circinatum\.json/,
    );
  });

  it('requires a plant id to be the slug of its name parts', () => {
    expectError(
      validateWith((es) => {
        const e = entry(es, 'plant/acer-circinatum');
        e.entry.id = 'vine-maple';
        e.file = 'content/plant/vine-maple.json';
      }),
      /id must be "acer-circinatum"/,
    );
  });

  it('derives a plant name: a stored one fails', () => {
    expectError(validateWith((es) => (plant(es, 'acer-circinatum').name = 'Vine maple')), /name is derived/);
  });

  it('rejects revisedAt before createdAt', () => {
    expectError(validateWith((es) => (plant(es, 'acer-circinatum').meta.revisedAt = '2020-01-01')), /revisedAt is before/);
  });
});

describe('ranges', () => {
  it('min may not exceed max', () => {
    expectError(validateWith((es) => (plant(es, 'acer-circinatum').data.height = { min: 30, max: 10 })), /data\.height: min is greater than max/);
  });

  it('months are 1 to 12', () => {
    expectError(validateWith((es) => (plant(es, 'acer-circinatum').data.bloom = { months: { start: 0, end: 13 } })), /bloom\/months\/start/);
  });

  it('hardiness zones are 1a to 13b, cold to warm', () => {
    expectError(validateWith((es) => (plant(es, 'acer-circinatum').data.hardiness = { min: '14', max: '9' })), /hardiness\/min/);
    expectError(validateWith((es) => (plant(es, 'acer-circinatum').data.hardiness = { min: '9', max: '5' })), /min zone is warmer/);
  });

  it('bloom months may wrap the year', () => {
    expect(messages(validateWith((es) => (plant(es, 'acer-circinatum').data.bloom!.months = { start: 11, end: 2 })))).toEqual([]);
  });
});

describe('names and synonyms', () => {
  it('botanical names are unique', () => {
    expectError(
      validateWith((es) => {
        const copy = structuredClone(entry(es, 'plant/acer-circinatum'));
        copy.file = 'content/plant/acer-circinatum-2.json';
        copy.entry.id = 'acer-circinatum-2';
        es.push(copy);
      }),
      /also plant\/acer-circinatum/,
    );
  });

  it('a synonym may not be another plant’s name', () => {
    expectError(validateWith((es) => plant(es, 'mahonia-nervosa').data.synonyms!.push('Mahonia aquifolium')), /synonym "Mahonia aquifolium" is the name of plant\/mahonia-aquifolium/);
  });

  it('a synonym may not belong to two plants', () => {
    expectError(validateWith((es) => plant(es, 'mahonia-nervosa').data.synonyms!.push('Berberis aquifolium')), /Berberis aquifolium/);
  });

  it('the family must be in the family table', () => {
    expectError(validateWith((es) => (plant(es, 'acer-circinatum').data.family = 'Notarealaceae')), /family Notarealaceae is not in/);
  });

  it('warns on near-duplicate common names', () => {
    const r = validateWith((es) => (plant(es, 'mahonia-nervosa').data.commonNames[0] = 'Tall Oregon-grape'));
    expect(r.warnings.some((w) => /nearly the same/.test(w.message))).toBe(true);
  });
});

describe('provenance', () => {
  it('a cited source must be registered', () => {
    expectError(validateWith((es) => (plant(es, 'acer-circinatum').data.sources[0].source = 'some-blog')), /"some-blog" is not in the source registry/);
  });

  it('every populated trait must be cited', () => {
    expectError(
      validateWith((es) => (plant(es, 'acer-circinatum').data.sources[0].fields = plant(es, 'acer-circinatum').data.sources[0].fields.filter((f) => f !== 'height'))),
      /data\.height is populated but no source cites it/,
    );
  });

  it('life cycle is a trait apart from form, and is cited like one', () => {
    expect(messages(validateWith((es) => (plant(es, 'achillea-millefolium').data.form = 'graminoid')))).toEqual([]);
    expectError(
      validateWith((es) => {
        const s = plant(es, 'achillea-millefolium').data.sources.find((c) => c.source === 'usda-plants')!;
        s.fields = s.fields.filter((f) => f !== 'lifeCycle');
      }),
      /data\.lifeCycle is populated but no source cites it/,
    );
  });

  it('a parent key cites all its parts', () => {
    const r = validateWith((es) => {
      const s = plant(es, 'acer-circinatum').data.sources[0];
      s.fields = [...s.fields.filter((f) => !f.startsWith('soil.')), 'soil'];
    });
    expect(messages(r)).toEqual([]);
  });

  it('a source may be cited only for what it provides', () => {
    expectError(
      validateWith((es) => plant(es, 'gaultheria-shallon').data.sources[1].fields.push('nativeRange'), {}),
      /staff-observation may not be cited for nativeRange/,
    );
  });

  it('a staff observation fills only a trait no other source gives', () => {
    expectError(validateWith((es) => plant(es, 'gaultheria-shallon').data.sources[1].fields.push('height')), /height is given by usda-plants/);
  });

  it('a staff observation names its contributor', () => {
    expectError(validateWith((es) => delete plant(es, 'gaultheria-shallon').data.sources[1].contributor), /names its contributor/);
  });

  const usePlaceholder = (es: Parameters<Parameters<typeof validateWith>[0]>[0], fields: string[]) => {
    const d = plant(es, 'acer-circinatum').data;
    d.sources[0].fields = d.sources[0].fields.filter((f) => !fields.includes(f));
    d.sources.push({ source: 'placeholder', accessed: '2026-11-18', fields });
  };

  it('a placeholder, with no URL, may stand in for a required field no source gives', () => {
    expect(messages(validateWith((es) => usePlaceholder(es, ['family'])))).toEqual([]);
  });

  it('a placeholder stands in only for a required field', () => {
    expectError(validateWith((es) => usePlaceholder(es, ['height'])), /a placeholder stands in only for a required field \(family, form\), not height/);
  });

  it('a placeholder is not cited for a field a source gives', () => {
    expectError(
      validateWith((es) => plant(es, 'acer-circinatum').data.sources.push({ source: 'placeholder', accessed: '2026-11-18', fields: ['family'] })),
      /family is given by usda-plants, so it needs no placeholder/,
    );
  });

  it('two sources may both cite a trait (they disagreed; the PR said which won)', () => {
    expect(messages(validateWith(() => {}))).toEqual([]);
  });
});

describe('images', () => {
  it('a listed file must exist', () => {
    expectError(validateWith((es) => (plant(es, 'acer-circinatum').data.images![0].file = 'assets/images/plant/acer-circinatum/9.jpg')), /9\.jpg does not exist/);
  });

  it('fails above 2 MB and warns above 500 KB', () => {
    const big = validateWith(() => {}, { fileSize: () => 3 * 1024 * 1024 });
    expectError(big, /over the 2 MB limit/);
    const mid = validateWith(() => {}, { fileSize: () => 600 * 1024 });
    expect(messages(mid)).toEqual([]);
    expect(mid.warnings.some((w) => /over 500 KB/.test(w.message))).toBe(true);
  });

  it('exactly one image is pinned', () => {
    expectError(validateWith((es) => plant(es, 'acer-circinatum').data.images!.forEach((i) => (i.pinned = true))), /exactly one image must be pinned \(found 2\)/);
    expectError(validateWith((es) => plant(es, 'acer-circinatum').data.images!.forEach((i) => (i.pinned = false))), /found 0/);
  });

  it('an image needs an allowed license and a credit', () => {
    expectError(validateWith((es) => (plant(es, 'acer-circinatum').data.images![0].license = 'CC-BY-ND-4.0')), /license: must be one of/);
    expectError(validateWith((es) => delete (plant(es, 'acer-circinatum').data.images![0] as { credit?: string }).credit), /must have required property 'credit'/);
  });

  it('an image lives under its plant’s folder', () => {
    expectError(validateWith((es) => (plant(es, 'acer-circinatum').data.images![1].file = 'assets/images/plant/thuja-plicata/1.jpg')), /must be under assets\/images\/plant\/acer-circinatum\//);
  });
});

describe('refs and markdown', () => {
  it('every {ref:…} token must resolve', () => {
    expectError(validateWith((es) => (plant(es, 'acer-circinatum').description = 'See {ref:plant/acer-nonexistens}.')), /\{ref:plant\/acer-nonexistens\} does not resolve/);
  });

  it('{ref:…} tokens only in markdown fields', () => {
    expectError(validateWith((es) => (plant(es, 'acer-circinatum').summary = 'Like {ref:plant/thuja-plicata}.')), /summary: \{ref:…\} tokens are allowed only in markdown fields/);
  });

  it('text fields stay in the markdown subset', () => {
    expectError(validateWith((es) => (plant(es, 'acer-circinatum').description = '## A heading')), /description: heading is not allowed/);
    expectError(validateWith((es) => (plant(es, 'gaultheria-shallon').fieldNotes![0].note = 'See <a href="x">this</a>')), /fieldNotes\[0\]\.note: HTML is not allowed/);
  });

  it('a field note’s trait must be a trait', () => {
    expectError(validateWith((es) => (plant(es, 'gaultheria-shallon').fieldNotes![1].trait = 'colour')), /"colour" is not a trait/);
  });
});

describe('fixtures only', () => {
  // The rule is generic: a type's fixtureRules name its proprietary fields.
  // Projects use it (client, constructionBudget; tests/project.test.ts); here it is exercised on plants.
  const withRule = (on: boolean) => ({
    config: (c: ReturnType<typeof setup>['config']) => {
      c.site.fixturesOnly = on;
      c.types.plant.fixtureRules = { proprietary: ['fruit'] };
    },
  });

  it('with fixturesOnly on, a non-fixture entry fails', () => {
    expectError(validateWith((es) => (plant(es, 'thuja-plicata').meta.fixture = false), withRule(true)), /must be a fixture/);
  });

  it('with fixturesOnly on, a filled proprietary field fails', () => {
    expectError(validateWith(() => {}, withRule(true)), /data\.fruit is proprietary/);
  });

  it('with fixturesOnly off, both pass', () => {
    const r = validateWith((es) => (plant(es, 'thuja-plicata').meta.fixture = false), withRule(false));
    expect(messages(r)).toEqual([]);
  });
});
