import type { FieldDefinition, BaseComponentProps, ConstructNode } from '../core/types.js';
import type { SchemaDefinition } from '../core/schema.js';
import { createElement } from '../core/jsx-runtime.js';

// ── Filter ──────────────────────────────────────────────────────────

export interface FilterProps extends BaseComponentProps {
  readonly condition: string;
  readonly children?: ConstructNode | ConstructNode[];
}

export function Filter(props: FilterProps): ConstructNode {
  const { children, ...rest } = props;
  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  return createElement('Filter', { ...rest }, ...childArray);
}

// ── Map ─────────────────────────────────────────────────────────────

export interface MapProps extends BaseComponentProps {
  readonly select: Record<string, string>;
  readonly children?: ConstructNode | ConstructNode[];
}

export function Map(props: MapProps): ConstructNode {
  const { children, ...rest } = props;
  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  return createElement('Map', { ...rest }, ...childArray);
}

// ── FlatMap ─────────────────────────────────────────────────────────

export interface FlatMapProps extends BaseComponentProps {
  readonly unnest: string;
  readonly as: Record<string, FieldDefinition>;
  readonly children?: ConstructNode | ConstructNode[];
}

export function FlatMap(props: FlatMapProps): ConstructNode {
  const { children, ...rest } = props;
  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  return createElement('FlatMap', { ...rest }, ...childArray);
}

// ── Aggregate ───────────────────────────────────────────────────────

export interface AggregateProps extends BaseComponentProps {
  readonly groupBy: readonly string[];
  readonly select: Record<string, string>;
  readonly children?: ConstructNode | ConstructNode[];
}

export function Aggregate(props: AggregateProps): ConstructNode {
  const { children, ...rest } = props;
  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  return createElement('Aggregate', { ...rest }, ...childArray);
}

// ── Union ───────────────────────────────────────────────────────────

export interface UnionProps extends BaseComponentProps {
  readonly inputs?: readonly SchemaDefinition[];
  readonly children?: ConstructNode | ConstructNode[];
}

export function Union(props: UnionProps): ConstructNode {
  if (props.inputs && props.inputs.length >= 2) {
    validateUnionSchemas(props.inputs);
  }

  const { children, ...rest } = props;
  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  return createElement('Union', { ...rest }, ...childArray);
}

function validateUnionSchemas(schemas: readonly SchemaDefinition[]): void {
  const reference = schemas[0];
  const refKeys = Object.keys(reference.fields).sort();
  const refSignature = refKeys.map((k) => `${k}:${reference.fields[k].arrowType}`).join(',');

  for (let i = 1; i < schemas.length; i++) {
    const current = schemas[i];
    const curKeys = Object.keys(current.fields).sort();
    const curSignature = curKeys.map((k) => `${k}:${current.fields[k].arrowType}`).join(',');

    if (refSignature !== curSignature) {
      throw new Error(
        `Union schema mismatch: input ${i} has fields [${curKeys.join(', ')}] ` +
        `which do not match input 0 fields [${refKeys.join(', ')}]`,
      );
    }
  }
}

// ── Deduplicate ─────────────────────────────────────────────────────

export interface DeduplicateProps extends BaseComponentProps {
  readonly key: readonly string[];
  readonly order: string;
  readonly keep: 'first' | 'last';
  readonly children?: ConstructNode | ConstructNode[];
}

export function Deduplicate(props: DeduplicateProps): ConstructNode {
  const { children, ...rest } = props;
  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  return createElement('Deduplicate', { ...rest }, ...childArray);
}

// ── TopN ────────────────────────────────────────────────────────────

export interface TopNProps extends BaseComponentProps {
  readonly partitionBy: readonly string[];
  readonly orderBy: Record<string, 'ASC' | 'DESC'>;
  readonly n: number;
  readonly children?: ConstructNode | ConstructNode[];
}

export function TopN(props: TopNProps): ConstructNode {
  const { children, ...rest } = props;
  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  return createElement('TopN', { ...rest }, ...childArray);
}
