/**
 * The filter tree (docs/site.md "Filter tree"): a nested accordion of disclosure buttons, with
 * values as checkboxes that keep their counts. The tree's shape comes from lib/filter-tree.ts.
 * Which nodes are open is the reader's: the ones open when the tree first shows (the view a link
 * opens), and from then on only what each disclosure opens or closes. Checking or clearing a
 * filter never opens or closes a node, and a node keeps its state while a node around it is closed.
 */
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { openAtStart, type TreeNode, type ValueNode } from '../../../../lib/filter-tree';
import { Icon } from './Icon';

/** A DOM id for a tree node or value. */
export const idFor = (id: string) => `filter-${id.replace(/[^A-Za-z0-9_-]/g, '_')}`;

type Toggle = (id: string, open: boolean) => void;

interface Shared {
  isOpen: (id: string) => boolean;
  toggle: Toggle;
  onToggle: (key: string, value: string) => void;
}

export function FilterTree({ nodes, onToggle, children }: { nodes: TreeNode[]; onToggle: (key: string, value: string) => void; children?: ComponentChildren }) {
  const [opened, setOpened] = useState<Set<string>>(() => openAtStart(nodes));
  const shared: Shared = {
    isOpen: (id) => opened.has(id),
    toggle: (id, open) =>
      setOpened((current) => {
        const next = new Set(current);
        if (open) next.add(id);
        else next.delete(id);
        return next;
      }),
    onToggle,
  };
  return (
    <div class="filter-tree">
      {children}
      <ul role="list" class="tree">
        {nodes.map((n) => (
          <Node key={n.id} node={n} shared={shared} />
        ))}
      </ul>
    </div>
  );
}

/** A disclosure button for a node; its panel follows it. */
function Disclosure({ id, open, toggle, label, describe }: { id: string; open: boolean; toggle: Toggle; label: ComponentChildren; describe?: string }) {
  return (
    <button
      type="button"
      class="tree-toggle"
      id={`${idFor(id)}-toggle`}
      aria-expanded={open}
      aria-controls={`${idFor(id)}-panel`}
      {...(describe ? { 'aria-label': describe } : {})}
      onClick={() => toggle(id, !open)}
    >
      <Icon name="expand" />
      {describe ? null : label}
    </button>
  );
}

function Count({ n }: { n: number }) {
  return (
    <span class="count">
      {n}
      <span class="visually-hidden"> {n === 1 ? 'entry' : 'entries'}</span>
    </span>
  );
}

function Value({ parent, facetKey, value, onToggle }: { parent: string; facetKey: string; value: ValueNode; onToggle: Shared['onToggle'] }) {
  const id = idFor(`${parent}-${value.id}`);
  return (
    <li class={value.count === 0 && !value.selected ? 'tree-value empty' : 'tree-value'}>
      <input type="checkbox" id={id} checked={value.selected} onChange={() => onToggle(facetKey, value.id)} />
      <label for={id}>
        {value.label} <Count n={value.count} />
      </label>
    </li>
  );
}

function Node({ node, shared }: { node: TreeNode; shared: Shared }) {
  const open = shared.isOpen(node.id);
  const panel = `${idFor(node.id)}-panel`;
  if (node.kind === 'type') {
    const id = idFor(node.id);
    return (
      <li class="tree-node tree-type">
        <div class="tree-row">
          {node.checkable ? (
            <>
              <input type="checkbox" id={id} checked={node.value.selected} onChange={() => shared.onToggle('type', node.value.id)} />
              <label for={id}>
                {node.value.label} <Count n={node.value.count} />
              </label>
              <Disclosure id={node.id} open={open} toggle={shared.toggle} label={node.value.label} describe={`${node.value.label} filters`} />
            </>
          ) : (
            <Disclosure id={node.id} open={open} toggle={shared.toggle} label={node.value.label} />
          )}
        </div>
        <ul role="list" class="tree-children" id={panel} hidden={!open}>
          {node.children.map((c) => (
            <Node key={c.id} node={c} shared={shared} />
          ))}
        </ul>
      </li>
    );
  }
  if (node.kind === 'group') {
    return (
      <li class={node.id === 'group:tags' ? 'tree-node tree-type' : 'tree-node'}>
        <Disclosure id={node.id} open={open} toggle={shared.toggle} label={node.label} />
        <ul role="list" class="tree-children" id={panel} hidden={!open}>
          {node.children.map((c) => (
            <Node key={c.id} node={c} shared={shared} />
          ))}
        </ul>
      </li>
    );
  }
  const n = node.values.filter((v) => v.selected).length;
  return (
    <li class="tree-node" data-active={n > 0 || undefined}>
      <Disclosure
        id={node.id}
        open={open}
        toggle={shared.toggle}
        label={
          <>
            {node.facet.label}
            {n > 0 && <span class="facet-active"> ({n} selected)</span>}
          </>
        }
      />
      <ul role="list" class="tree-values" id={panel} hidden={!open} aria-labelledby={`${idFor(node.id)}-toggle`}>
        {node.values.map((v) => (
          <Value key={v.id} parent={node.id} facetKey={node.facet.key} value={v} onToggle={shared.onToggle} />
        ))}
      </ul>
    </li>
  );
}
