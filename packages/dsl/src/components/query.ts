import type { BaseComponentProps, ConstructNode, TypedConstructNode } from '../core/types.js';
import type { SchemaDefinition } from '../core/schema.js';
import { createElement } from '../core/jsx-runtime.js';

// ── Types ────────────────────────────────────────────────────────────

export interface WindowSpec {
  readonly partitionBy?: readonly string[];
  readonly orderBy?: Record<string, 'ASC' | 'DESC'>;
}

export interface WindowFunctionExpr {
  readonly func: string;
  readonly args?: readonly (string | number)[];
  readonly window?: string;
  readonly over?: WindowSpec;
}

export type ColumnExpr = string | WindowFunctionExpr;

// ── Clause types ─────────────────────────────────────────────────────

const QUERY_CLAUSE_TYPES = new Set([
  'Query.Select',
  'Query.Where',
  'Query.GroupBy',
  'Query.Having',
  'Query.OrderBy',
]);

export { QUERY_CLAUSE_TYPES };

// ── Query.Select ─────────────────────────────────────────────────────

export interface QuerySelectProps extends BaseComponentProps {
  readonly columns: Record<string, ColumnExpr>;
  readonly windows?: Record<string, WindowSpec>;
  readonly children?: ConstructNode | ConstructNode[];
}

function QuerySelect(props: QuerySelectProps): TypedConstructNode<'Query.Select'> {
  const { children, ...rest } = props;
  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  return createElement('Query.Select', { ...rest }, ...childArray) as TypedConstructNode<'Query.Select'>;
}

// ── Query.Where ──────────────────────────────────────────────────────

export interface QueryWhereProps extends BaseComponentProps {
  readonly condition: string;
  readonly children?: ConstructNode | ConstructNode[];
}

function QueryWhere(props: QueryWhereProps): TypedConstructNode<'Query.Where'> {
  const { children, ...rest } = props;
  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  return createElement('Query.Where', { ...rest }, ...childArray) as TypedConstructNode<'Query.Where'>;
}

// ── Query.GroupBy ────────────────────────────────────────────────────

export interface QueryGroupByProps extends BaseComponentProps {
  readonly columns: readonly string[];
  readonly children?: ConstructNode | ConstructNode[];
}

function QueryGroupBy(props: QueryGroupByProps): TypedConstructNode<'Query.GroupBy'> {
  const { children, ...rest } = props;
  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  return createElement('Query.GroupBy', { ...rest }, ...childArray) as TypedConstructNode<'Query.GroupBy'>;
}

// ── Query.Having ─────────────────────────────────────────────────────

export interface QueryHavingProps extends BaseComponentProps {
  readonly condition: string;
  readonly children?: ConstructNode | ConstructNode[];
}

function QueryHaving(props: QueryHavingProps): TypedConstructNode<'Query.Having'> {
  const { children, ...rest } = props;
  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  return createElement('Query.Having', { ...rest }, ...childArray) as TypedConstructNode<'Query.Having'>;
}

// ── Query.OrderBy ────────────────────────────────────────────────────

export interface QueryOrderByProps extends BaseComponentProps {
  readonly columns: Record<string, 'ASC' | 'DESC'>;
  readonly children?: ConstructNode | ConstructNode[];
}

function QueryOrderBy(props: QueryOrderByProps): TypedConstructNode<'Query.OrderBy'> {
  const { children, ...rest } = props;
  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  return createElement('Query.OrderBy', { ...rest }, ...childArray) as TypedConstructNode<'Query.OrderBy'>;
}

// ── Query ────────────────────────────────────────────────────────────

export interface QueryProps extends BaseComponentProps {
  readonly outputSchema: SchemaDefinition;
  readonly children?: ConstructNode | ConstructNode[];
}

function QueryFactory(props: QueryProps): ConstructNode {
  const { children, ...rest } = props;
  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  const clauseChildren = childArray.filter(
    (c) => QUERY_CLAUSE_TYPES.has(c.component),
  );

  const selectCount = clauseChildren.filter(
    (c) => c.component === 'Query.Select',
  ).length;
  if (selectCount === 0) {
    throw new Error('Query requires a Query.Select child');
  }
  if (selectCount > 1) {
    throw new Error('Query must have at most one Query.Select child');
  }

  for (const clauseType of QUERY_CLAUSE_TYPES) {
    const count = clauseChildren.filter(
      (c) => c.component === clauseType,
    ).length;
    if (count > 1) {
      throw new Error(`Query must have at most one ${clauseType} child`);
    }
  }

  const hasHaving = clauseChildren.some(
    (c) => c.component === 'Query.Having',
  );
  const hasGroupBy = clauseChildren.some(
    (c) => c.component === 'Query.GroupBy',
  );
  if (hasHaving && !hasGroupBy) {
    throw new Error('Query.Having requires a Query.GroupBy sibling');
  }

  return createElement('Query', { ...rest }, ...childArray);
}

export const Query: typeof QueryFactory & {
  Select: typeof QuerySelect;
  Where: typeof QueryWhere;
  GroupBy: typeof QueryGroupBy;
  Having: typeof QueryHaving;
  OrderBy: typeof QueryOrderBy;
} = Object.assign(QueryFactory, {
  Select: QuerySelect,
  Where: QueryWhere,
  GroupBy: QueryGroupBy,
  Having: QueryHaving,
  OrderBy: QueryOrderBy,
});
