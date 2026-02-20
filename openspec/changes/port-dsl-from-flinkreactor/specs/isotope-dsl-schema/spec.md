## ADDED Requirements

### Requirement: Schema system with Arrow type mapping
The DSL SHALL provide a `Schema()` factory and `Field` builders in `packages/dsl/src/core/schema.ts` ported from FlinkReactor. The `Field` builders SHALL map to Arrow types internally while preserving the FlinkReactor-compatible API names.

#### Scenario: Field builders map to Arrow types
- **WHEN** `Field.BIGINT()` is called
- **THEN** it SHALL return a field definition with `arrowType: ArrowType.ARROW_INT64`

#### Scenario: Field builder API coverage
- **WHEN** the Field object is used
- **THEN** it SHALL provide builders for: `BOOLEAN()`, `TINYINT()`, `SMALLINT()`, `INT()`, `BIGINT()`, `FLOAT()`, `DOUBLE()`, `STRING()`, `DATE()`, `TIME()`, `BYTES()`, `DECIMAL(p,s)`, `TIMESTAMP(p)`, `TIMESTAMP_LTZ(p)`, `VARCHAR(len)`, `CHAR(len)`, `ARRAY(type)`, `MAP(keyType, valueType)`, `ROW(fields)`

### Requirement: Arrow type mapping table
The schema system SHALL implement the following type mappings:

| Field Builder | Flink SQL Type | Arrow Type |
|---|---|---|
| `Field.BOOLEAN()` | BOOLEAN | ARROW_BOOLEAN |
| `Field.TINYINT()` | TINYINT | ARROW_INT8 (mapped to INT32) |
| `Field.SMALLINT()` | SMALLINT | ARROW_INT16 (mapped to INT32) |
| `Field.INT()` | INT | ARROW_INT32 |
| `Field.BIGINT()` | BIGINT | ARROW_INT64 |
| `Field.FLOAT()` | FLOAT | ARROW_FLOAT32 |
| `Field.DOUBLE()` | DOUBLE | ARROW_FLOAT64 |
| `Field.STRING()` | STRING | ARROW_STRING |
| `Field.DATE()` | DATE | ARROW_DATE32 |
| `Field.TIMESTAMP(3)` | TIMESTAMP(3) | ARROW_TIMESTAMP_MS |
| `Field.TIMESTAMP(6)` | TIMESTAMP(6) | ARROW_TIMESTAMP_US |
| `Field.DECIMAL(p,s)` | DECIMAL(p,s) | ARROW_DECIMAL128 |
| `Field.ARRAY(type)` | ARRAY<type> | ARROW_LIST |
| `Field.MAP(k,v)` | MAP<k,v> | ARROW_MAP |
| `Field.ROW(fields)` | ROW<...> | ARROW_STRUCT |

#### Scenario: Schema with watermark
- **WHEN** a Schema is created with a watermark declaration
- **THEN** it SHALL validate that the watermark column exists in the fields and is a TIMESTAMP type

#### Scenario: Schema with primary key
- **WHEN** a Schema is created with a primaryKey declaration
- **THEN** it SHALL validate that all primary key columns exist in the fields

### Requirement: SchemaDefinition type
The DSL SHALL export a `SchemaDefinition<T>` type with `fields: T`, optional `watermark: WatermarkDeclaration`, optional `primaryKey: PrimaryKeyDeclaration`. Metadata columns (FlinkReactor's `MetadataColumnDeclaration`) SHALL NOT be included.

#### Scenario: Schema validation rejects unknown fields in watermark
- **WHEN** a Schema is created with `watermark: { column: 'nonexistent', expression: '...' }`
- **THEN** the Schema() factory SHALL throw an error indicating the column doesn't exist
