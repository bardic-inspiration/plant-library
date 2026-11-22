// The filter tree's shape (docs/site.md "Filter tree"), built from the fixture library's index.
import { describe, expect, it } from 'vitest';
import { buildData } from '../lib/build-data';
import { emptyQuery, facetCounts, parseQuery } from '../lib/filter';
import { filterTree, openAtStart, type TreeNode } from '../lib/filter-tree';
import type { IndexFacet } from '../lib/types';
import { FIXTURES } from './helpers';

const index = buildData({ dataRoot: FIXTURES }).index;
const tree = (search = '', facets: IndexFacet[] = index.facets) => {
  const query = search ? parseQuery(search) : emptyQuery();
  return filterTree(facets, query, facetCounts(index.records, facets, query, null));
};
const find = (nodes: TreeNode[], id: string): TreeNode | undefined => {
  for (const n of nodes) {
    if (n.id === id) return n;
    const inner = n.kind === 'facet' ? undefined : find(n.children, id);
    if (inner) return inner;
  }
  return undefined;
};

describe('the filter tree', () => {
  it('lists the types in index order, then the Tags, with no separate Type facet', () => {
    expect(tree().map((n) => n.id)).toEqual(['type:plant', 'type:project', 'type:palette', 'group:tags']);
    expect(find(tree(), 'facet:type')).toBeUndefined();
  });

  it('makes each type a checkable value of the type filter, counted as any value is', () => {
    const nodes = tree('?type=project');
    const plant = find(nodes, 'type:plant');
    const project = find(nodes, 'type:project');
    const of = (t: string) => index.records.filter((r) => r.type === t).length;
    expect(plant?.kind === 'type' && plant.checkable).toBe(true);
    expect(project?.kind === 'type' && project.value).toMatchObject({ selected: true, count: of('project') });
    // A value's count is the results with it checked given the other facets' selections, so checking a type leaves the others' counts.
    expect(plant?.kind === 'type' && plant.value).toMatchObject({ selected: false, count: of('plant') });
  });

  it('nests a type’s facets in their registry groups, where each group first appears', () => {
    const plant = find(tree(), 'type:plant');
    if (plant?.kind !== 'type') throw new Error('no plant node');
    const ids = plant.children.map((n) => n.id);
    expect(ids.slice(0, 5)).toEqual(['facet:plant.form', 'facet:plant.lifeCycle', 'facet:plant.foliage', 'group:plant:size', 'facet:plant.sun']);
    const size = find(plant.children, 'group:plant:size');
    expect(size?.kind === 'group' && size.label).toBe('Size');
    expect(size?.kind === 'group' && size.children.map((n) => n.id)).toEqual(['facet:plant.height', 'facet:plant.spread', 'facet:plant.sizeClass']);
  });

  it('gives each value its label, count, and whether it is checked', () => {
    const sun = find(tree('?plant.sun=shade'), 'facet:plant.sun');
    if (sun?.kind !== 'facet') throw new Error('no sun node');
    const shade = sun.values.find((v) => v.id === 'shade');
    expect(shade).toMatchObject({ selected: true, label: 'Shade' });
    expect(shade?.count).toBeGreaterThan(0);
    expect(sun.values.filter((v) => v.selected)).toHaveLength(1);
  });

  it('opens at start exactly the nodes holding a selected value, and a checked type', () => {
    expect(openAtStart(tree())).toEqual(new Set());
    expect(openAtStart(tree('?plant.height=0-1&tag.collection=pnw-natives'))).toEqual(
      new Set(['type:plant', 'group:plant:size', 'facet:plant.height', 'group:tags', 'facet:tag.collection']),
    );
    expect(openAtStart(tree('?type=palette'))).toEqual(new Set(['type:palette']));
  });

  it('with one type indexed, opens that type and offers no checkbox for it', () => {
    const facets = index.facets
      .filter((f) => f.type === 'plant' || f.key === 'type')
      .map((f) => (f.key === 'type' ? { ...f, values: f.values.filter((v) => v.id === 'plant') } : f));
    const [plant] = tree('', facets);
    expect(plant.kind === 'type' && plant.checkable).toBe(false);
    expect(openAtStart([plant])).toEqual(new Set(['type:plant']));
  });
});
