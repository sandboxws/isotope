import type { BaseComponentProps, ConstructNode, TypedConstructNode } from '../core/types.js';
import { createElement } from '../core/jsx-runtime.js';

type RouteBranchNode = TypedConstructNode<'Route.Branch'>;
type RouteDefaultNode = TypedConstructNode<'Route.Default'>;

// ── Route.Branch ────────────────────────────────────────────────────

export interface RouteBranchProps extends BaseComponentProps {
  readonly condition: string;
  readonly children?: ConstructNode | ConstructNode[];
}

function RouteBranch(props: RouteBranchProps): RouteBranchNode {
  const { children, ...rest } = props;
  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  return createElement('Route.Branch', { ...rest }, ...childArray) as RouteBranchNode;
}

// ── Route.Default ───────────────────────────────────────────────────

export interface RouteDefaultProps extends BaseComponentProps {
  readonly children?: ConstructNode | ConstructNode[];
}

function RouteDefault(props: RouteDefaultProps): RouteDefaultNode {
  const { children, ...rest } = props;
  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  return createElement('Route.Default', { ...rest }, ...childArray) as RouteDefaultNode;
}

// ── Route ───────────────────────────────────────────────────────────

export interface RouteProps extends BaseComponentProps {
  readonly children?: ConstructNode | ConstructNode[];
}

function RouteFactory(props: RouteProps): ConstructNode {
  const { children, ...rest } = props;
  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  const hasBranch = childArray.some(
    (c) => c.component === 'Route.Branch',
  );

  if (!hasBranch) {
    throw new Error('Route requires at least one Route.Branch child');
  }

  return createElement('Route', { ...rest }, ...childArray);
}

export const Route: typeof RouteFactory & {
  Branch: typeof RouteBranch;
  Default: typeof RouteDefault;
} = Object.assign(RouteFactory, {
  Branch: RouteBranch,
  Default: RouteDefault,
});
