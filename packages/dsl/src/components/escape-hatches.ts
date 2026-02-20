import type { BaseComponentProps, ConstructNode } from '../core/types.js';
import type { SchemaDefinition } from '../core/schema.js';
import { createElement } from '../core/jsx-runtime.js';

// ── RawSQL ──────────────────────────────────────────────────────────

export interface RawSQLProps extends BaseComponentProps {
  readonly sql: string;
  readonly inputs: readonly ConstructNode[];
  readonly outputSchema: SchemaDefinition;
  readonly children?: ConstructNode | ConstructNode[];
}

export function RawSQL(props: RawSQLProps): ConstructNode {
  const { inputs, children, ...rest } = props;

  if (!inputs || inputs.length === 0) {
    throw new Error('RawSQL requires at least one input stream');
  }

  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  return createElement('RawSQL', { ...rest, inputIds: inputs.map((i) => i.id) }, ...inputs, ...childArray);
}
