import type { ConstructNode, NodeKind } from './types.js';

// ── JSX type declarations ────────────────────────────────────────────
// Exported as a module-scoped namespace for use with jsxImportSource.
// Consumers set "jsxImportSource": "@isotope/dsl" in their tsconfig.

export namespace JSX {
  export type Element = ConstructNode;
  export interface IntrinsicElements {}
  export interface ElementChildrenAttribute {
    children: {};
  }
}

// ── ID generation ────────────────────────────────────────────────────

let nextNodeId = 0;
const usedNodeIds: Set<string> = new Set();

export function resetNodeIdCounter(): void {
  nextNodeId = 0;
  usedNodeIds.clear();
}

export function toSqlIdentifier(value: string): string {
  return value
    .replace(/[.\-/]/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function generateNodeId(component: string, nameHint?: string): string {
  const base = nameHint
    ? toSqlIdentifier(nameHint)
    : `${component}_${nextNodeId++}`;

  let id = base;
  let suffix = 2;
  while (usedNodeIds.has(id)) {
    id = `${base}_${suffix}`;
    suffix++;
  }

  usedNodeIds.add(id);
  if (nameHint) {
    nextNodeId++;
  }

  return id;
}

// ── Component type → NodeKind mapping ────────────────────────────────

const BUILTIN_KINDS: ReadonlyMap<string, NodeKind> = new Map([
  ['Pipeline', 'Pipeline'],
  // Sources
  ['KafkaSource', 'Source'],
  ['GeneratorSource', 'Source'],
  // Sinks
  ['KafkaSink', 'Sink'],
  ['ConsoleSink', 'Sink'],
  // Transforms
  ['Filter', 'Transform'],
  ['Map', 'Transform'],
  ['FlatMap', 'Transform'],
  ['Aggregate', 'Transform'],
  ['Union', 'Transform'],
  ['Deduplicate', 'Transform'],
  ['TopN', 'Transform'],
  ['Route', 'Transform'],
  ['Route.Branch', 'Transform'],
  ['Route.Default', 'Transform'],
  // Field transforms
  ['Rename', 'Transform'],
  ['Drop', 'Transform'],
  ['Cast', 'Transform'],
  ['Coalesce', 'Transform'],
  ['AddField', 'Transform'],
  // Joins
  ['Join', 'Join'],
  ['TemporalJoin', 'Join'],
  ['LookupJoin', 'Join'],
  ['IntervalJoin', 'Join'],
  // Windows
  ['TumbleWindow', 'Window'],
  ['SlideWindow', 'Window'],
  ['SessionWindow', 'Window'],
  // Escape hatches
  ['RawSQL', 'RawSQL'],
  ['Query', 'Transform'],
  ['Query.Select', 'Transform'],
  ['Query.Where', 'Transform'],
  ['Query.GroupBy', 'Transform'],
  ['Query.Having', 'Transform'],
  ['Query.OrderBy', 'Transform'],
  // CEP
  ['MatchRecognize', 'CEP'],
  // View
  ['View', 'View'],
]);

let kindMap: Map<string, NodeKind> = new Map(BUILTIN_KINDS);

export function registerComponentKinds(components: ReadonlyMap<string, NodeKind>): void {
  for (const [name, kind] of components) {
    kindMap.set(name, kind);
  }
}

export function resetComponentKinds(): void {
  kindMap = new Map(BUILTIN_KINDS);
}

function resolveKind(component: string): NodeKind {
  return kindMap.get(component) ?? 'Transform';
}

// ── createElement ────────────────────────────────────────────────────

export function createElement(
  component: string | Function,
  props: Record<string, unknown> | null,
  ...children: (ConstructNode | ConstructNode[] | null | undefined)[]
): ConstructNode {
  if (typeof component === 'function') {
    const flatChildren = children
      .flat(Infinity)
      .filter((c): c is ConstructNode => c != null && typeof c === 'object' && '_tag' in c === false && 'id' in c);

    const mergedProps: Record<string, unknown> = { ...(props ?? {}) };
    if (flatChildren.length > 0) {
      mergedProps.children = flatChildren;
    }
    return component(mergedProps) as ConstructNode;
  }

  const nameHint = props?._nameHint as string | undefined;
  const id = generateNodeId(component, nameHint);
  const kind = resolveKind(component);

  const flatChildren = children
    .flat(Infinity)
    .filter((c): c is ConstructNode => c != null && typeof c === 'object' && '_tag' in c === false && 'id' in c);

  const cleanProps = { ...(props ?? {}) };
  delete cleanProps.children;
  delete cleanProps._nameHint;

  const node: ConstructNode = {
    id,
    kind,
    component,
    props: cleanProps,
    children: flatChildren,
  };

  return node;
}

// ── Fragment ─────────────────────────────────────────────────────────

export function Fragment(props: { children?: ConstructNode[] }): ConstructNode[] {
  return props.children ?? [];
}

// ── JSX automatic runtime exports ────────────────────────────────────

export function jsx(
  type: string | Function,
  props: Record<string, unknown>,
  key?: string,
): ConstructNode {
  const { children, ...rest } = props;
  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  if (key !== undefined) {
    rest.key = key;
  }

  return createElement(type, rest, ...childArray);
}

export const jsxs = jsx;
