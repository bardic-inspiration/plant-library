// @vitest-environment happy-dom
// The filter tree's open nodes (docs/site.md "Filter tree"): every control in the tree is a
// discrete interaction. Checking or clearing a filter never opens or closes a node; a disclosure
// opens or closes its own node only. Rendered into happy-dom and clicked as a reader does.
import { h, render } from 'preact';
import { useState } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { buildData } from '../lib/build-data';
import { clearFilters, facetCounts, parseQuery, toggleValue, type Query } from '../lib/filter';
import { filterTree } from '../lib/filter-tree';
import { FilterTree } from '../site/src/components/ui/FilterTree';
import { FIXTURES } from './helpers';

const index = buildData({ dataRoot: FIXTURES }).index;
let root: HTMLElement | undefined;
let clear: () => void = () => {};

afterEach(() => {
  if (!root) return;
  act(() => render(null, root!));
  root.remove();
  root = undefined;
});

/** The tree as the Library holds it: the query in state, the tree rebuilt from it on every change. */
function Harness({ initial }: { initial: string }) {
  const [query, setQuery] = useState<Query>(() => parseQuery(initial));
  clear = () => setQuery((q) => clearFilters(q));
  const nodes = filterTree(index.facets, query, facetCounts(index.records, index.facets, query, null));
  return h(FilterTree, { nodes, onToggle: (k: string, v: string) => setQuery((q) => toggleValue(q, k, v)) });
}

function mount(initial = '') {
  root = document.body.appendChild(document.createElement('div'));
  act(() => render(h(Harness, { initial }), root!));
}

const disclosures = () => Object.fromEntries([...document.querySelectorAll('.tree-toggle')].map((b) => [b.id, b.getAttribute('aria-expanded')]));
const byId = <T extends HTMLElement>(id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`no #${id}`);
  return el as T;
};
const click = (id: string) => act(() => byId(id).click());

const PLANT = 'filter-type_plant';
const SUN = 'filter-facet_plant_sun';
const SIZE = 'filter-group_plant_size';
const HEIGHT = 'filter-facet_plant_height';

describe('the filter tree’s disclosures', () => {
  it('start open only where a link holds a filter', () => {
    mount('?plant.sun=shade');
    const open = Object.entries(disclosures())
      .filter(([, v]) => v === 'true')
      .map(([k]) => k);
    expect(open).toEqual([`${PLANT}-toggle`, `${SUN}-toggle`]);
    expect(byId(`${SUN}-panel`).hidden).toBe(false);
    expect(byId(`${SIZE}-panel`).hidden).toBe(true);
  });

  it('open and close only their own node', () => {
    mount();
    const before = disclosures();
    click(`${PLANT}-toggle`);
    expect(disclosures()).toEqual({ ...before, [`${PLANT}-toggle`]: 'true' });
    click(`${PLANT}-toggle`);
    expect(disclosures()).toEqual(before);
  });

  it('don’t move when a type or value is checked or unchecked, or filters are cleared', () => {
    mount();
    click(`${PLANT}-toggle`);
    click(`${SUN}-toggle`);
    const before = disclosures();
    act(() => byId<HTMLInputElement>(`${SUN}-shade`).click());
    expect(byId<HTMLInputElement>(`${SUN}-shade`).checked).toBe(true);
    expect(disclosures()).toEqual(before);
    act(() => byId<HTMLInputElement>('filter-type_project').click());
    expect(disclosures()).toEqual(before);
    act(() => clear());
    expect(byId<HTMLInputElement>(`${SUN}-shade`).checked).toBe(false);
    expect(disclosures()).toEqual(before);
  });

  it('keep a node’s state while a node around it is closed', () => {
    mount();
    click(`${PLANT}-toggle`);
    click(`${SIZE}-toggle`);
    click(`${HEIGHT}-toggle`);
    click(`${PLANT}-toggle`);
    click(`${PLANT}-toggle`);
    expect(disclosures()[`${SIZE}-toggle`]).toBe('true');
    expect(disclosures()[`${HEIGHT}-toggle`]).toBe('true');
  });

  it('name each type’s disclosure, and keep values a list labelled by their facet', () => {
    mount();
    expect(byId(`${PLANT}-toggle`).getAttribute('aria-label')).toBe('Plants filters');
    const values = byId(`${SUN}-panel`);
    expect(values.getAttribute('role')).toBe('list');
    expect(values.getAttribute('aria-labelledby')).toBe(`${SUN}-toggle`);
  });
});
