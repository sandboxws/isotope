import type { BaseComponentProps, ConstructNode } from '../core/types.js';
import { createElement } from '../core/jsx-runtime.js';

// ── Regular Join ────────────────────────────────────────────────────

export type JoinType = 'inner' | 'left' | 'right' | 'full' | 'anti' | 'semi';

export interface JoinProps extends BaseComponentProps {
  readonly left: ConstructNode;
  readonly right: ConstructNode;
  readonly on: string;
  readonly type?: JoinType;
  readonly stateTtl?: string;
  readonly children?: ConstructNode | ConstructNode[];
}

export function Join(props: JoinProps): ConstructNode {
  if (!props.left || !props.right) {
    throw new Error('Join requires both left and right inputs');
  }

  const { children, left, right, ...rest } = props;
  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  return createElement(
    'Join',
    { ...rest, left: left.id, right: right.id },
    left,
    right,
    ...childArray,
  );
}

// ── Temporal Join ───────────────────────────────────────────────────

export interface TemporalJoinProps extends BaseComponentProps {
  readonly stream: ConstructNode;
  readonly temporal: ConstructNode;
  readonly on: string;
  readonly asOf: string;
  readonly children?: ConstructNode | ConstructNode[];
}

export function TemporalJoin(props: TemporalJoinProps): ConstructNode {
  const { children, stream, temporal, ...rest } = props;
  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  return createElement(
    'TemporalJoin',
    { ...rest, stream: stream.id, temporal: temporal.id },
    stream,
    temporal,
    ...childArray,
  );
}

// ── Lookup Join ─────────────────────────────────────────────────────

export interface LookupAsyncConfig {
  readonly enabled: boolean;
  readonly capacity?: number;
  readonly timeout?: string;
}

export interface LookupCacheConfig {
  readonly type: 'lru';
  readonly maxRows: number;
  readonly ttl: string;
}

export interface LookupJoinProps extends BaseComponentProps {
  readonly input: ConstructNode;
  readonly table: string;
  readonly url: string;
  readonly on: string;
  readonly select?: Record<string, string>;
  readonly async?: LookupAsyncConfig;
  readonly cache?: LookupCacheConfig;
  readonly children?: ConstructNode | ConstructNode[];
}

export function LookupJoin(props: LookupJoinProps): ConstructNode {
  const { children, input, ...rest } = props;
  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  return createElement(
    'LookupJoin',
    { ...rest, input: input.id },
    input,
    ...childArray,
  );
}

// ── Interval Join ───────────────────────────────────────────────────

export interface IntervalBounds {
  readonly from: string;
  readonly to: string;
}

export interface IntervalJoinProps extends BaseComponentProps {
  readonly left: ConstructNode;
  readonly right: ConstructNode;
  readonly on: string;
  readonly interval: IntervalBounds;
  readonly type?: 'inner' | 'left' | 'right' | 'full';
  readonly children?: ConstructNode | ConstructNode[];
}

export function IntervalJoin(props: IntervalJoinProps): ConstructNode {
  const { children, left, right, ...rest } = props;
  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  return createElement(
    'IntervalJoin',
    { ...rest, left: left.id, right: right.id },
    left,
    right,
    ...childArray,
  );
}
