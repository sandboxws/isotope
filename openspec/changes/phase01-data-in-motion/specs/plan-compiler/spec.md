## ADDED Requirements

### Requirement: ConstructNode to Protobuf compilation
The plan-compiler SHALL transform a `ConstructNode` tree (produced by the JSX runtime) into a serialized Protobuf `ExecutionPlan`. Each ConstructNode SHALL map to an `OperatorNode` with the appropriate `oneof config` variant. Parent-child relationships SHALL map to `Edge` entries.

#### Scenario: Simple pipeline compilation
- **WHEN** a TSX pipeline `<Pipeline><KafkaSource /><Filter /><KafkaSink /></Pipeline>` is compiled
- **THEN** the output ExecutionPlan SHALL contain 3 OperatorNodes and 2 Edges (source→filter, filter→sink)

#### Scenario: Fan-out pipeline compilation
- **WHEN** a Route operator fans out to 3 branches
- **THEN** the ExecutionPlan SHALL contain edges from Route to each branch's first operator

### Requirement: Schema resolution and propagation
The plan-compiler SHALL resolve and propagate schemas through the DAG: source schemas are defined by the user, transform schemas are inferred from input schemas and operator configuration (e.g., Map changes columns, Filter preserves schema), and sink schemas are validated against the incoming schema.

#### Scenario: Map schema inference
- **WHEN** a Map operator selects `{user_id: "user_id", name: "UPPER(full_name)"}` from a schema with 5 columns
- **THEN** the compiler SHALL infer the output schema as 2 columns: `user_id` (same type) and `name` (Utf8)

#### Scenario: Filter schema pass-through
- **WHEN** a Filter operator has an input schema with columns `[a, b, c]`
- **THEN** the output schema SHALL be identical: `[a, b, c]` with same types and nullability

### Requirement: Shuffle strategy planning
The plan-compiler SHALL assign `ShuffleStrategy` to each edge based on operator requirements: FORWARD for adjacent stateless operators (enables chaining), HASH for keyed operations (joins, group-by), BROADCAST for small-table joins.

#### Scenario: KeyBy implies HASH shuffle
- **WHEN** an Aggregate with `groupBy: ["user_id"]` follows a source
- **THEN** the edge SHALL have `shuffle: HASH` with `partition_keys: ["user_id"]`

#### Scenario: Chained stateless operators use FORWARD
- **WHEN** Filter is followed by Map with no parallelism change
- **THEN** the edge SHALL have `shuffle: FORWARD`

### Requirement: Execution strategy assignment
The plan-compiler SHALL set `execution_strategy` on each OperatorNode: `ARROW_NATIVE` for stateless operators (Filter, Map, FlatMap, Rename, Drop, Cast, Union, Route), `DUCKDB_MICRO_BATCH` for windowed aggregations, TopN, windowed hash joins, and RawSQL.

#### Scenario: Stateless operator strategy
- **WHEN** a Filter operator is compiled
- **THEN** its `execution_strategy` SHALL be `ARROW_NATIVE`

#### Scenario: Windowed aggregate strategy
- **WHEN** an Aggregate inside a TumbleWindow is compiled
- **THEN** its `execution_strategy` SHALL be `DUCKDB_MICRO_BATCH`

### Requirement: Source location embedding
The plan-compiler SHALL embed TSX source file, line, and column information in each OperatorNode's `SourceLocation` field for cross-language debugging.

#### Scenario: Source location in compiled plan
- **WHEN** a Filter component is defined at line 25, column 4 of `pipeline.tsx`
- **THEN** the compiled OperatorNode SHALL have `source_location: {file: "pipeline.tsx", line: 25, column: 4}`
