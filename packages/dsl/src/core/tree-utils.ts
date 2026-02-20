import type { ConstructNode, NodeKind } from './types.js';

// ── rekindTree ──────────────────────────────────────────────────────

export function rekindTree(
  root: ConstructNode,
  kindMap: ReadonlyMap<string, NodeKind>,
): ConstructNode {
  return mapTree(root, (node) => {
    const newKind = kindMap.get(node.component);
    if (newKind !== undefined && newKind !== node.kind) {
      return { ...node, kind: newKind };
    }
    return node;
  });
}

// ── mapTree ─────────────────────────────────────────────────────────

export function mapTree(
  root: ConstructNode,
  visitor: (node: ConstructNode) => ConstructNode,
): ConstructNode {
  const mappedChildren = root.children.map((child) => mapTree(child, visitor));

  const childrenChanged = mappedChildren.some((c, i) => c !== root.children[i]);
  const nodeWithChildren: ConstructNode = childrenChanged
    ? { ...root, children: mappedChildren }
    : root;

  return visitor(nodeWithChildren);
}

// ── walkTree ────────────────────────────────────────────────────────

export function walkTree(
  root: ConstructNode,
  callback: (node: ConstructNode) => void | false,
): void {
  const result = callback(root);
  if (result === false) return;

  for (const child of root.children) {
    walkTree(child, callback);
  }
}

// ── findNodes ───────────────────────────────────────────────────────

export function findNodes(
  root: ConstructNode,
  predicate: (node: ConstructNode) => boolean,
): ConstructNode[] {
  const results: ConstructNode[] = [];
  walkTree(root, (node) => {
    if (predicate(node)) {
      results.push(node);
    }
  });
  return results;
}

// ── wrapNode ────────────────────────────────────────────────────────

export function wrapNode(
  root: ConstructNode,
  targetId: string,
  wrapper: Omit<ConstructNode, 'children'>,
): ConstructNode {
  return mapTree(root, (node) => {
    if (node.id === targetId) {
      return { ...wrapper, children: [node] };
    }
    return node;
  });
}

// ── replaceChild ────────────────────────────────────────────────────

export function replaceChild(
  root: ConstructNode,
  childId: string,
  replacement: ConstructNode,
): ConstructNode {
  return mapTree(root, (node) => {
    const idx = node.children.findIndex((c) => c.id === childId);
    if (idx === -1) return node;

    const newChildren = [...node.children];
    newChildren[idx] = replacement;
    return { ...node, children: newChildren };
  });
}
