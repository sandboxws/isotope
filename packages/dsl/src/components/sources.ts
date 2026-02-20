import type { FieldDefinition, BaseComponentProps, ConstructNode } from '../core/types.js';
import type { SchemaDefinition, WatermarkDeclaration } from '../core/schema.js';
import { createElement, toSqlIdentifier } from '../core/jsx-runtime.js';

// ── Shared source types ─────────────────────────────────────────────

export type KafkaFormat = 'json' | 'csv';

export type KafkaStartupMode =
  | 'latest-offset'
  | 'earliest-offset'
  | 'group-offsets';

// ── KafkaSource ─────────────────────────────────────────────────────

export interface KafkaSourceProps<
  T extends Record<string, FieldDefinition> = Record<string, FieldDefinition>,
> extends BaseComponentProps {
  readonly name?: string;
  readonly topic: string;
  readonly bootstrapServers: string;
  readonly format?: KafkaFormat;
  readonly schema: SchemaDefinition<T>;
  readonly watermark?: WatermarkDeclaration;
  readonly startupMode?: KafkaStartupMode;
  readonly consumerGroup?: string;
  readonly children?: ConstructNode | ConstructNode[];
}

export function KafkaSource<T extends Record<string, FieldDefinition>>(
  props: KafkaSourceProps<T>,
): ConstructNode {
  const { children, name, ...rest } = props;
  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  const _nameHint = name ?? toSqlIdentifier(props.topic);

  return createElement('KafkaSource', { ...rest, _nameHint }, ...childArray);
}

// ── GeneratorSource ─────────────────────────────────────────────────

export interface GeneratorSourceProps<
  T extends Record<string, FieldDefinition> = Record<string, FieldDefinition>,
> extends BaseComponentProps {
  readonly name?: string;
  readonly schema: SchemaDefinition<T>;
  readonly rowsPerSecond: number;
  readonly maxRows?: number;
  readonly children?: ConstructNode | ConstructNode[];
}

export function GeneratorSource<T extends Record<string, FieldDefinition>>(
  props: GeneratorSourceProps<T>,
): ConstructNode {
  const { children, name, ...rest } = props;
  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  const _nameHint = name ?? 'generator';

  return createElement('GeneratorSource', { ...rest, _nameHint }, ...childArray);
}
