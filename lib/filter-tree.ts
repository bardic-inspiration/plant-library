/**
 * The Library's filter tree (docs/site.md "Filter tree"): the types, each a value of the type
 * filter holding its own facets grouped as `config/types.json` groups them, then the Tags. Pure,
 * so the island only renders it and keeps which nodes are open.
 */
import type { Query } from './filter';
import type { IndexFacet } from './types';

/** One checkable value: a facet's value, or a type as a value of the type filter. */
export interface ValueNode {
  id: string;
  label: string;
  count: number;
  selected: boolean;
}

export type TreeNode =
  /** A type: checking it is the type filter (offered when more than one type is indexed); inside it, its facets. */
  | { kind: 'type'; id: string; value: ValueNode; checkable: boolean; open: boolean; children: TreeNode[] }
  /** A registry group, such as Size or Used in, or the Tags. */
  | { kind: 'group'; id: string; label: string; open: boolean; children: TreeNode[] }
  | { kind: 'facet'; id: string; facet: IndexFacet; open: boolean; values: ValueNode[] };

type Counts = Record<string, Record<string, number>>;

function facetNode(facet: IndexFacet, query: Query, counts: Counts): TreeNode {
  const selected = query.filters[facet.key] ?? [];
  const values = facet.values.map((v) => ({ id: v.id, label: v.label, count: counts[facet.key]?.[v.id] ?? 0, selected: selected.includes(v.id) }));
  return { kind: 'facet', id: `facet:${facet.key}`, facet, open: values.some((v) => v.selected), values };
}

/** Facets in index order, those sharing a group nested in one node where the group first appears. */
function grouped(facets: IndexFacet[], prefix: string, query: Query, counts: Counts): TreeNode[] {
  const out: TreeNode[] = [];
  const groups = new Map<string, Extract<TreeNode, { kind: 'group' }>>();
  for (const f of facets) {
    const node = facetNode(f, query, counts);
    if (!f.group) {
      out.push(node);
      continue;
    }
    let g = groups.get(f.group);
    if (!g) {
      g = { kind: 'group', id: `group:${prefix}${f.group}`, label: f.groupLabel ?? f.group, open: false, children: [] };
      groups.set(f.group, g);
      out.push(g);
    }
    g.children.push(node);
    g.open ||= node.open;
  }
  return out;
}

/**
 * The tree for an index and a query. A type's count is the type filter's (`counts.type`), counted
 * as any value is (`facetCounts` in lib/filter.ts). A node is `open` when it holds a selected value; a
 * checked type is open, and with one type indexed so is that type, since there is no other to choose.
 */
export function filterTree(facets: IndexFacet[], query: Query, counts: Counts): TreeNode[] {
  const typeFacet = facets.find((f) => f.key === 'type');
  const types = typeFacet?.values ?? [];
  const selectedTypes = query.filters.type ?? [];
  const nodes: TreeNode[] = types.map((t) => {
    const children = grouped(
      facets.filter((f) => f.type === t.id),
      `${t.id}:`,
      query,
      counts,
    );
    return {
      kind: 'type',
      id: `type:${t.id}`,
      value: { id: t.id, label: t.label, count: counts.type?.[t.id] ?? 0, selected: selectedTypes.includes(t.id) },
      checkable: types.length > 1,
      open: types.length === 1 || selectedTypes.includes(t.id) || children.some((c) => c.open),
      children,
    };
  });
  const tags = facets.filter((f) => f.key.startsWith('tag.'));
  if (tags.length > 0) {
    const children = tags.map((f) => facetNode(f, query, counts));
    nodes.push({ kind: 'group', id: 'group:tags', label: 'Tags', open: children.some((c) => c.open), children });
  }
  return nodes;
}

/**
 * The ids of the nodes that start open. The island reads them once, when the tree first shows
 * (the view a link opens); after that only a node's own disclosure opens or closes it.
 */
export function openAtStart(nodes: TreeNode[]): Set<string> {
  const ids = new Set<string>();
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      if (n.open) ids.add(n.id);
      if (n.kind !== 'facet') walk(n.children);
    }
  };
  walk(nodes);
  return ids;
}
