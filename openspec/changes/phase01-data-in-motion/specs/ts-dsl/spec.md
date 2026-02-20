## ADDED Requirements

### Requirement: JSX runtime and createElement
The DSL SHALL provide a custom JSX runtime where `<Component prop={value}>` calls `createElement(Component, {prop: value}, ...children)`, producing a `ConstructNode` tree (DAG). This SHALL be compatible with TypeScript's `jsxImportSource` configuration.

#### Scenario: JSX to ConstructNode tree
- **WHEN** a TSX file uses `<Pipeline><KafkaSource /><Filter /><KafkaSink /></Pipeline>`
- **THEN** `createElement` SHALL produce a `ConstructNode` tree with Pipeline as root and three child nodes

### Requirement: SchemaDefinition with Field builders
The DSL SHALL provide `Schema()` and `Field` builders that map to Protobuf `Schema` and `SchemaField`. Supported field types SHALL include: `Field.BIGINT()`, `Field.INT()`, `Field.FLOAT()`, `Field.DOUBLE()`, `Field.STRING()`, `Field.BOOLEAN()`, `Field.TIMESTAMP(precision)`, `Field.DATE()`, `Field.DECIMAL(precision, scale)`, `Field.ARRAY(elementType)`, `Field.MAP(keyType, valueType)`, `Field.ROW(fields)`.

#### Scenario: Define a schema with watermark
- **WHEN** a schema is defined with `Schema({ fields: { user_id: Field.BIGINT(), ts: Field.TIMESTAMP(3) }, watermark: { column: 'ts', expression: "ts - INTERVAL '5' SECOND" } })`
- **THEN** the resulting SchemaDefinition SHALL include field definitions and watermark configuration

### Requirement: SynthContext for DAG construction
The DSL SHALL provide a `SynthContext` that performs: topological sort of the ConstructNode tree, cycle detection, validation of schema compatibility between connected operators, and assignment of unique operator IDs.

#### Scenario: Cycle detection
- **WHEN** a pipeline definition creates a cycle (operator A → B → A)
- **THEN** `SynthContext` SHALL throw a descriptive error identifying the cycle

#### Scenario: Schema validation between operators
- **WHEN** a Filter operator's input schema doesn't match the upstream operator's output schema
- **THEN** `SynthContext` SHALL throw an error identifying the schema mismatch

### Requirement: All FlinkReactor component factories
The DSL SHALL provide TSX component factories for all operator types: `Pipeline`, `KafkaSource`, `JdbcSource`, `FileSource`, `GeneratorSource`, `KafkaSink`, `JdbcSink`, `FileSink`, `IcebergSink`, `ConsoleSink`, `Filter`, `Map`, `FlatMap`, `Aggregate`, `Deduplicate`, `TopN`, `Union`, `HashJoin`, `IntervalJoin`, `LookupJoin`, `TemporalJoin`, `TumbleWindow`, `SlideWindow`, `SessionWindow`, `Route`, `RawSQL`, `MatchRecognize`.

#### Scenario: KafkaSource component
- **WHEN** `<KafkaSource topic="events" schema={EventSchema} />` is used in TSX
- **THEN** it SHALL produce a ConstructNode with type SOURCE and KafkaSourceConfig containing the topic and schema

#### Scenario: Nested window with aggregate
- **WHEN** `<TumbleWindow size="5 MINUTE"><Aggregate groupBy={['id']} select={{...}} /></TumbleWindow>` is used
- **THEN** the ConstructNode tree SHALL represent the window containing the aggregate as a child

### Requirement: TypeScript type safety for schemas
Schema field types SHALL be propagated through components via TypeScript generics so that column references in Filter conditions, Map expressions, and Join conditions are type-checked at compile time where possible.

#### Scenario: Type-safe column references in Map
- **WHEN** a Map component references a column that doesn't exist in the input schema
- **THEN** the TypeScript compiler SHALL emit a type error (where the schema is statically known)
