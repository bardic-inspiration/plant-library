import { cpSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildData } from '../lib/build-data';
import type { LoadedEntry } from '../lib/content';
import { FIXTURES, messages, validateWith } from './helpers';

/** A made-up project, valid against every rule; tests change one thing at a time. */
function project(): LoadedEntry {
  return {
    file: 'content/project/test-park.json',
    entry: {
      type: 'project',
      id: 'test-park',
      name: 'Test Park',
      summary: 'A made-up park for the validation tests.',
      data: {
        landscapeArchitect: 'Example Studio',
        location: { lat: 47.60621, lon: -122.33207 },
        projectType: 'park',
        sizeAcres: 4.5,
        status: 'constructed',
        completed: '2024-06',
        plantList: [
          { plant: { ref: 'plant/acer-circinatum' }, quantity: 12, size: '#5 container' },
          { plant: { ref: 'plant/acer-circinatum' }, quantity: 3, size: '8 ft B&B', note: 'Multi-stem' },
          { plant: "Cornus sericea 'Kelseyi'", quantity: 120, spacing: '24 in o.c.' },
        ],
      },
      meta: { createdAt: '2026-11-19', revisedAt: '2026-11-19', method: 'manual', fixture: true },
    },
  };
}

type Data = Record<string, unknown> & { plantList: Record<string, unknown>[]; location: { lat: number; lon: number } };
const withProject = (change: (d: Data, e: LoadedEntry) => void = () => {}, opts?: Parameters<typeof validateWith>[1]) =>
  validateWith((es) => {
    const p = project();
    change(p.entry.data as Data, p);
    es.push(p);
  }, opts);
const errors = (r: ReturnType<typeof validateWith>) => messages(r).filter((m) => m.startsWith('content/project/'));
const expectError = (r: ReturnType<typeof validateWith>, pattern: RegExp) =>
  expect(errors(r).some((m) => pattern.test(m)), errors(r).join('\n') || '(no errors)').toBe(true);
const projectWarnings = (r: ReturnType<typeof validateWith>) => r.warnings.filter((w) => w.file.startsWith('content/project/')).map((w) => w.message);

describe('project schema', () => {
  it('a valid project passes, warning only on its unsourced name', () => {
    const r = withProject();
    expect(messages(r)).toEqual([]);
    expect(projectWarnings(r)).toEqual([`data.plantList[2].plant: "Cornus sericea 'Kelseyi'" is not in the library (unsourced)`]);
  });

  it('requires the non-proprietary fields', () => {
    for (const f of ['landscapeArchitect', 'location', 'projectType', 'sizeAcres', 'status', 'plantList']) {
      expectError(withProject((d) => delete d[f]), new RegExp(`must have required property '${f}'`));
    }
  });

  it('requires a name', () => {
    expectError(withProject((_d, e) => delete e.entry.name), /name is required/);
  });

  it('rejects unknown keys, and values outside the vocabulary', () => {
    expectError(withProject((d) => (d.state = 'WA')), /unknown key "state"/);
    expectError(withProject((d) => (d.projectType = 'golf')), /data\/projectType: must be one of/);
    expectError(withProject((d) => (d.status = 'built')), /data\/status: must be one of/);
  });

  it('takes a partial completion date', () => {
    for (const c of ['2024', '2024-06', '2024-06-30']) expect(errors(withProject((d) => (d.completed = c)))).toEqual([]);
    expectError(withProject((d) => (d.completed = '2024-13')), /data\/completed/);
  });

  it('a plant list item needs a positive integer quantity', () => {
    expectError(withProject((d) => delete d.plantList[0].quantity), /must have required property 'quantity'/);
    expectError(withProject((d) => (d.plantList[0].quantity = 0)), /quantity/);
    expectError(withProject((d) => (d.plantList[0].quantity = 2.5)), /quantity/);
  });

  it('plantList[].plant is RefOrText: a ref object or plain text, nothing else', () => {
    expectError(withProject((d) => (d.plantList[0].plant = { ref: 'plant/acer-circinatum', size: 'x' })), /plantList\/0\/plant/);
    expectError(withProject((d) => (d.plantList[0].plant = 42)), /plantList\/0\/plant/);
    expectError(withProject((d) => (d.plantList[0].plant = '')), /plantList\/0\/plant/);
  });

  it('a ref in a plant list must resolve, and name a plant', () => {
    expectError(withProject((d) => (d.plantList[0].plant = { ref: 'plant/acer-nonexistens' })), /ref plant\/acer-nonexistens does not resolve/);
    expectError(withProject((d) => (d.plantList[0].plant = { ref: 'project/test-park' })), /project\/test-park is not a plant/);
  });
});

describe('fixtures only, on projects', () => {
  it('a project must be a fixture', () => {
    expectError(withProject((_d, e) => (e.entry.meta.fixture = false)), /must be a fixture/);
    expectError(withProject((_d, e) => delete e.entry.meta.fixture), /must be a fixture/);
  });

  it('client and constructionBudget must be blank', () => {
    expectError(withProject((d) => (d.client = 'A city')), /data\.client is proprietary/);
    expectError(withProject((d) => (d.constructionBudget = 1200000)), /data\.constructionBudget is proprietary/);
  });

  it('with fixturesOnly off, they may be filled', () => {
    const off = { config: (c: { site: { fixturesOnly: boolean } }) => (c.site.fixturesOnly = false) };
    expect(errors(withProject((d) => Object.assign(d, { client: 'A city', constructionBudget: 1200000 }), off))).toEqual([]);
    expectError(withProject((d) => (d.constructionBudget = 12.5), off), /constructionBudget: must be integer/);
  });
});

describe('location', () => {
  it('must fall inside WA, OR, or CA', () => {
    expect(errors(withProject((d) => (d.location = { lat: 45.52345, lon: -122.67621 })))).toEqual([]); // Portland
    expect(errors(withProject((d) => (d.location = { lat: 34.05223, lon: -118.24368 })))).toEqual([]); // Los Angeles
    expectError(withProject((d) => (d.location = { lat: 43.615, lon: -116.20231 })), /outside WA, OR, CA/); // Boise
    expectError(withProject((d) => (d.location = { lat: 46.5, lon: -125.5 })), /outside WA, OR, CA/); // Pacific
  });

  it('holds at most 5 decimal places', () => {
    expect(errors(withProject((d) => (d.location = { lat: 47.6, lon: -122.3 })))).toEqual([]);
    expectError(withProject((d) => (d.location.lat = 47.606209)), /at most 5 decimal places/);
    expectError(withProject((d) => (d.location.lon = -122.332071)), /at most 5 decimal places/);
  });
});

describe('completion', () => {
  it('is required when constructed', () => {
    expectError(withProject((d) => delete d.completed), /completed is required when status is constructed/);
  });

  it('may be left out when proposed', () => {
    expect(errors(withProject((d) => Object.assign(d, { status: 'proposed', completed: undefined })))).toEqual([]);
  });
});

describe('plant lists', () => {
  it('a plant appears once per distinct size', () => {
    expectError(withProject((d) => (d.plantList[1].size = '#5 container')), /plantList\[1\]: the same plant and size as data\.plantList\[0\]/);
    expectError(withProject((d) => d.plantList.push({ plant: "cornus sericea 'Kelseyi'", quantity: 4 })), /plantList\[3\]: the same plant and size as data\.plantList\[2\]/);
    const noSize = (d: Data) => d.plantList.forEach((i) => delete i.size);
    expectError(withProject(noSize), /the same plant and size/);
  });

  it('an unsourced name that is a plant’s name, synonym, or name with trade name must be a ref', () => {
    expectError(withProject((d) => (d.plantList[2].plant = 'Acer circinatum')), /"Acer circinatum" is plant\/acer-circinatum in the library/);
    expectError(withProject((d) => (d.plantList[2].plant = 'Berberis aquifolium')), /is plant\/mahonia-aquifolium/);
    expectError(withProject((d) => (d.plantList[2].plant = "Rosa 'Radrazz' Knock Out")), /is plant\/rosa-radrazz/);
    expectError(withProject((d) => (d.plantList[2].plant = "ACER CIRCINATUM 'PACIFIC FIRE'")), /is plant\/acer-circinatum-pacific-fire/);
  });

  it('an unsourced name the library doesn’t hold warns, and passes', () => {
    const r = withProject((d) => d.plantList.push({ plant: 'Ribes sanguineum', quantity: 6 }));
    expect(messages(r)).toEqual([]);
    expect(projectWarnings(r)).toHaveLength(2);
  });
});

describe('back-references', () => {
  it('a plant’s refBy lists the projects whose lists include it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'plant-library-'));
    try {
      cpSync(FIXTURES, dir, { recursive: true });
      mkdirSync(join(dir, 'content', 'project'));
      const p = project();
      writeFileSync(join(dir, p.file), JSON.stringify(p.entry));
      const data = buildData({ dataRoot: dir });
      expect(data.library.report.errors).toEqual([]);
      expect(data.byKey.get('plant/acer-circinatum')!.refBy).toContain('project/test-park');
      expect(data.byKey.get('plant/thuja-plicata')!.refBy).not.toContain('project/test-park');
      expect(data.byKey.get('project/test-park')!.refs).toEqual(['plant/acer-circinatum']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
