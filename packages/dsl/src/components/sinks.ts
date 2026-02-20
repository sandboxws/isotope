import type { BaseComponentProps, ConstructNode } from '../core/types.js';
import { createElement, toSqlIdentifier } from '../core/jsx-runtime.js';

// ── Shared sink types ───────────────────────────────────────────────

export type SinkFormat = 'json' | 'csv';

// ── KafkaSink ───────────────────────────────────────────────────────

export interface KafkaSinkProps extends BaseComponentProps {
  readonly name?: string;
  readonly topic: string;
  readonly bootstrapServers: string;
  readonly format?: SinkFormat;
  readonly keyBy?: readonly string[];
  readonly children?: ConstructNode | ConstructNode[];
}

export function KafkaSink(props: KafkaSinkProps): ConstructNode {
  const { children, name, ...rest } = props;
  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  const _nameHint = name ?? toSqlIdentifier(props.topic);

  return createElement('KafkaSink', { ...rest, _nameHint }, ...childArray);
}

// ── ConsoleSink ─────────────────────────────────────────────────────

export interface ConsoleSinkProps extends BaseComponentProps {
  readonly name?: string;
  readonly maxRows?: number;
  readonly children?: ConstructNode | ConstructNode[];
}

export function ConsoleSink(props: ConsoleSinkProps): ConstructNode {
  const { children, name, ...rest } = props;
  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  const _nameHint = name ?? 'console';

  return createElement('ConsoleSink', { ...rest, _nameHint }, ...childArray);
}
