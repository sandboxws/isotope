// ── Arrow type system ────────────────────────────────────────────────

export enum ArrowType {
  ARROW_INT8 = 'ARROW_INT8',
  ARROW_INT16 = 'ARROW_INT16',
  ARROW_INT32 = 'ARROW_INT32',
  ARROW_INT64 = 'ARROW_INT64',
  ARROW_FLOAT32 = 'ARROW_FLOAT32',
  ARROW_FLOAT64 = 'ARROW_FLOAT64',
  ARROW_STRING = 'ARROW_STRING',
  ARROW_BINARY = 'ARROW_BINARY',
  ARROW_BOOLEAN = 'ARROW_BOOLEAN',
  ARROW_TIMESTAMP_MS = 'ARROW_TIMESTAMP_MS',
  ARROW_TIMESTAMP_US = 'ARROW_TIMESTAMP_US',
  ARROW_DATE32 = 'ARROW_DATE32',
  ARROW_DECIMAL128 = 'ARROW_DECIMAL128',
  ARROW_LIST = 'ARROW_LIST',
  ARROW_MAP = 'ARROW_MAP',
  ARROW_STRUCT = 'ARROW_STRUCT',
}

// ── Field definition ─────────────────────────────────────────────────

export interface FieldDefinition {
  readonly type: string;
  readonly arrowType: ArrowType;
}

// ── Changelog mode ───────────────────────────────────────────────────

export type ChangelogMode = 'append-only' | 'retract' | 'upsert';

// ── Schema ───────────────────────────────────────────────────────────

export type IsotopeSchema<
  T extends Record<string, FieldDefinition> = Record<string, FieldDefinition>,
> = T;

// ── Stream (branded type) ────────────────────────────────────────────

declare const streamBrand: unique symbol;

export type Stream<
  T extends Record<string, FieldDefinition> = Record<string, FieldDefinition>,
> = {
  readonly [streamBrand]: true;
  readonly _tag: 'Stream';
  readonly _schema: IsotopeSchema<T>;
  readonly _nodeId: string;
  readonly _changelogMode: ChangelogMode;
};

export function createStream<T extends Record<string, FieldDefinition>>(
  nodeId: string,
  schema: IsotopeSchema<T>,
  changelogMode: ChangelogMode = 'append-only',
): Stream<T> {
  return {
    _tag: 'Stream',
    _schema: schema,
    _nodeId: nodeId,
    _changelogMode: changelogMode,
  } as Stream<T>;
}

// ── Base component props ─────────────────────────────────────────────

export interface BaseComponentProps {
  readonly parallelism?: number;
}

// ── Construct tree node types ────────────────────────────────────────

export type NodeKind =
  | 'Pipeline'
  | 'Source'
  | 'Sink'
  | 'Transform'
  | 'Join'
  | 'Window'
  | 'RawSQL'
  | 'CEP'
  | 'View';

export interface ConstructNode {
  readonly id: string;
  readonly kind: NodeKind;
  readonly component: string;
  readonly props: Record<string, unknown>;
  readonly children: ConstructNode[];
}

export interface TypedConstructNode<C extends string = string> extends ConstructNode {
  readonly __componentBrand: C;
}
