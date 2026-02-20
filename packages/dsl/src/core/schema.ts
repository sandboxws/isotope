import { ArrowType, type FieldDefinition } from './types.js';

// ── Arrow type validation ───────────────────────────────────────────

const VALID_ARROW_TYPES: ReadonlySet<string> = new Set(Object.values(ArrowType));

export function isValidArrowType(type: string): type is ArrowType {
  return VALID_ARROW_TYPES.has(type);
}

// ── Watermark declaration ────────────────────────────────────────────

export interface WatermarkDeclaration {
  readonly column: string;
  readonly expression: string;
}

// ── Primary key declaration ──────────────────────────────────────────

export interface PrimaryKeyDeclaration {
  readonly columns: readonly string[];
}

// ── Schema definition ────────────────────────────────────────────────

export interface SchemaDefinition<
  T extends Record<string, FieldDefinition> = Record<string, FieldDefinition>,
> {
  readonly fields: T;
  readonly watermark?: WatermarkDeclaration;
  readonly primaryKey?: PrimaryKeyDeclaration;
}

// ── Schema builder options ───────────────────────────────────────────

export interface SchemaOptions<T extends Record<string, FieldDefinition>> {
  readonly fields: T;
  readonly watermark?: WatermarkDeclaration;
  readonly primaryKey?: PrimaryKeyDeclaration;
}

/**
 * Build a validated schema definition.
 * Throws if any field's arrowType is not a recognized Arrow type.
 */
export function Schema<T extends Record<string, FieldDefinition>>(
  options: SchemaOptions<T>,
): SchemaDefinition<T> {
  for (const [name, field] of Object.entries(options.fields)) {
    if (!isValidArrowType(field.arrowType)) {
      throw new Error(`Invalid Arrow type '${field.arrowType}' for field '${name}'`);
    }
  }

  if (options.watermark) {
    const { column } = options.watermark;
    if (!(column in options.fields)) {
      throw new Error(
        `Watermark column '${column}' is not a declared field`,
      );
    }
  }

  if (options.primaryKey) {
    for (const col of options.primaryKey.columns) {
      if (!(col in options.fields)) {
        throw new Error(
          `Primary key column '${col}' is not a declared field`,
        );
      }
    }
  }

  return {
    fields: options.fields,
    watermark: options.watermark,
    primaryKey: options.primaryKey,
  };
}

// ── Field type builders ──────────────────────────────────────────────

export const Field = {
  BOOLEAN(): FieldDefinition { return { type: 'BOOLEAN', arrowType: ArrowType.ARROW_BOOLEAN }; },
  TINYINT(): FieldDefinition { return { type: 'TINYINT', arrowType: ArrowType.ARROW_INT8 }; },
  SMALLINT(): FieldDefinition { return { type: 'SMALLINT', arrowType: ArrowType.ARROW_INT16 }; },
  INT(): FieldDefinition { return { type: 'INT', arrowType: ArrowType.ARROW_INT32 }; },
  BIGINT(): FieldDefinition { return { type: 'BIGINT', arrowType: ArrowType.ARROW_INT64 }; },
  FLOAT(): FieldDefinition { return { type: 'FLOAT', arrowType: ArrowType.ARROW_FLOAT32 }; },
  DOUBLE(): FieldDefinition { return { type: 'DOUBLE', arrowType: ArrowType.ARROW_FLOAT64 }; },
  STRING(): FieldDefinition { return { type: 'STRING', arrowType: ArrowType.ARROW_STRING }; },
  DATE(): FieldDefinition { return { type: 'DATE', arrowType: ArrowType.ARROW_DATE32 }; },
  TIME(): FieldDefinition { return { type: 'TIME', arrowType: ArrowType.ARROW_INT64 }; },
  BYTES(): FieldDefinition { return { type: 'BYTES', arrowType: ArrowType.ARROW_BINARY }; },

  DECIMAL(precision: number, scale: number): FieldDefinition {
    return { type: `DECIMAL(${precision}, ${scale})`, arrowType: ArrowType.ARROW_DECIMAL128 };
  },
  TIMESTAMP(precision: number = 3): FieldDefinition {
    const arrowType = precision <= 3 ? ArrowType.ARROW_TIMESTAMP_MS : ArrowType.ARROW_TIMESTAMP_US;
    return { type: `TIMESTAMP(${precision})`, arrowType };
  },
  TIMESTAMP_LTZ(precision: number = 3): FieldDefinition {
    const arrowType = precision <= 3 ? ArrowType.ARROW_TIMESTAMP_MS : ArrowType.ARROW_TIMESTAMP_US;
    return { type: `TIMESTAMP_LTZ(${precision})`, arrowType };
  },
  VARCHAR(length: number): FieldDefinition {
    return { type: `VARCHAR(${length})`, arrowType: ArrowType.ARROW_STRING };
  },
  CHAR(length: number): FieldDefinition {
    return { type: `CHAR(${length})`, arrowType: ArrowType.ARROW_STRING };
  },

  ARRAY(elementType: FieldDefinition): FieldDefinition {
    return { type: `ARRAY<${elementType.type}>`, arrowType: ArrowType.ARROW_LIST };
  },
  MAP(keyType: FieldDefinition, valueType: FieldDefinition): FieldDefinition {
    return { type: `MAP<${keyType.type}, ${valueType.type}>`, arrowType: ArrowType.ARROW_MAP };
  },
  ROW(fields: Record<string, FieldDefinition>): FieldDefinition {
    const fieldStr = Object.entries(fields)
      .map(([name, f]) => `${name} ${f.type}`)
      .join(', ');
    return { type: `ROW<${fieldStr}>`, arrowType: ArrowType.ARROW_STRUCT };
  },
} as const;
