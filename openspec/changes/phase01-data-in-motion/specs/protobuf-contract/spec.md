## ADDED Requirements

### Requirement: ExecutionPlan Protobuf schema
The system SHALL define a Protobuf `ExecutionPlan` message in `proto/isotope/v1/plan.proto` that fully describes a pipeline's operators, edges, schemas, and configuration. The schema SHALL include `pipeline_name`, `default_parallelism`, `PipelineMode` (STREAMING/BATCH), `CheckpointConfig`, `StateConfig`, `RestartConfig`, `repeated OperatorNode`, and `repeated Edge`.

#### Scenario: Valid execution plan serialization
- **WHEN** the TypeScript plan-compiler produces an ExecutionPlan protobuf
- **THEN** the Go runtime SHALL deserialize it without data loss, including all operator configs, schemas, and edge definitions

#### Scenario: Schema field type mapping
- **WHEN** a SchemaField is defined with a `flink_type` (e.g., "BIGINT", "STRING", "TIMESTAMP(3)")
- **THEN** the corresponding `ArrowType` enum value SHALL be set (e.g., ARROW_INT64, ARROW_STRING, ARROW_TIMESTAMP_MS)

### Requirement: OperatorNode with execution strategy
Each `OperatorNode` message SHALL include an `id`, `OperatorType` enum, `parallelism`, `input_schema`, `output_schema`, `ChangelogMode`, `SourceLocation` (TSX file:line for debugging), and `ExecutionStrategy` (ARROW_NATIVE or DUCKDB_MICRO_BATCH). The operator-specific config SHALL use a protobuf `oneof` field.

#### Scenario: Operator node with source location
- **WHEN** a TSX component at `pipeline.tsx:42` is compiled to an OperatorNode
- **THEN** the OperatorNode's `source_location` SHALL contain `file: "pipeline.tsx"`, `line: 42`

#### Scenario: Operator execution strategy assignment
- **WHEN** a stateless operator (Filter, Map) is compiled
- **THEN** its `execution_strategy` SHALL be set to `ARROW_NATIVE`

### Requirement: Edge and shuffle strategy
Each `Edge` message SHALL define `from_operator`, `to_operator`, `ShuffleStrategy` (FORWARD, HASH, BROADCAST, ROUND_ROBIN, RANGE), and optional `partition_keys`.

#### Scenario: Hash shuffle edge
- **WHEN** a KeyBy operation partitions by `["user_id"]`
- **THEN** the Edge SHALL have `shuffle: HASH` and `partition_keys: ["user_id"]`

### Requirement: Cross-language code generation
The `.proto` files SHALL be compiled to both TypeScript (via `@bufbuild/protobuf`) and Go (via `buf` or `protoc-gen-go`). Generated code SHALL live in `packages/dsl/src/generated/` (TypeScript) and `runtime/internal/proto/` (Go).

#### Scenario: Buf code generation
- **WHEN** `buf generate` is run against `proto/isotope/v1/`
- **THEN** TypeScript and Go stubs SHALL be generated with full type safety and serialization/deserialization support

### Requirement: SQL string expressions in operator configs
All transform operator configs (FilterConfig, MapConfig, AggregateConfig, etc.) SHALL use `string` fields for expressions (`condition_sql`, `expression_sql`) rather than a structured Expression protobuf. The Go runtime SHALL parse these via `vitess/sqlparser`.

#### Scenario: Filter with SQL condition
- **WHEN** a FilterConfig is defined with `condition_sql: "amount > 100 AND country = 'US'"`
- **THEN** the string SHALL be preserved verbatim through serialization and deserialization for the Go runtime to parse
