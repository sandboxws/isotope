## ADDED Requirements

### Requirement: Plan loader and validator
The Go runtime SHALL load a serialized Protobuf `ExecutionPlan` from a file or byte stream, deserialize it, and validate schema consistency (every edge references existing operators, input/output schemas match across edges, no cycles in the DAG).

#### Scenario: Load valid plan
- **WHEN** a valid serialized ExecutionPlan is provided
- **THEN** the runtime SHALL parse it into an in-memory DAG of operator descriptors with resolved schemas

#### Scenario: Reject invalid plan with mismatched schemas
- **WHEN** an ExecutionPlan has an edge where the upstream operator's output schema differs from the downstream operator's input schema
- **THEN** the loader SHALL return a descriptive error identifying the mismatched operators and fields

### Requirement: Execution engine with goroutine pool
The runtime SHALL execute each operator instance as a goroutine, wired together via buffered Go channels. The engine SHALL respect `parallelism` per operator, creating N goroutines for parallelism=N. Operators with FORWARD shuffle between them SHALL be fused into a single goroutine (operator chaining).

#### Scenario: Parallel operator execution
- **WHEN** an operator has `parallelism: 4`
- **THEN** the engine SHALL create 4 goroutine instances of that operator, each processing a partition of the data

#### Scenario: Operator chaining for FORWARD edges
- **WHEN** two operators are connected by a FORWARD edge
- **THEN** they SHALL execute in the same goroutine without channel overhead between them

### Requirement: Arrow RecordBatch data model
All inter-operator data transfer SHALL use Apache Arrow RecordBatches. The runtime SHALL configure a default batch size (1024-8192 rows) and use Arrow memory allocators with proper `Retain()`/`Release()` reference counting.

#### Scenario: RecordBatch lifecycle
- **WHEN** an operator produces output RecordBatches
- **THEN** each batch SHALL be properly reference-counted and released after the downstream operator finishes processing

#### Scenario: Memory leak detection in tests
- **WHEN** running tests with a memory-tracking allocator
- **THEN** any unreleased RecordBatch SHALL be detected and reported with the allocation site

### Requirement: Operator interface
The Go runtime SHALL define an `Operator` interface with methods: `Open(ctx *OperatorContext) error`, `ProcessBatch(batch arrow.Record) ([]arrow.Record, error)`, `ProcessWatermark(wm Watermark) error`, `ProcessCheckpointBarrier(barrier CheckpointBarrier) error`, `Close() error`.

#### Scenario: Operator lifecycle
- **WHEN** the engine starts an operator
- **THEN** it SHALL call `Open()` before any `ProcessBatch()`, and `Close()` during shutdown

### Requirement: Basic backpressure via channel blocking
The runtime SHALL use buffered Go channels between operators. When a downstream operator is slow, the channel fills up and the upstream goroutine blocks naturally. Buffer sizes SHALL be configurable per edge.

#### Scenario: Slow consumer causes upstream blocking
- **WHEN** a downstream operator processes batches slower than the upstream produces them
- **THEN** the upstream operator SHALL block on the channel send until buffer space is available, without data loss

### Requirement: Graceful shutdown
The runtime SHALL support graceful shutdown: stop sources, drain in-flight batches through the pipeline, close sinks, then exit. A configurable timeout SHALL force-kill remaining goroutines.

#### Scenario: Graceful shutdown on SIGTERM
- **WHEN** the runtime process receives SIGTERM
- **THEN** it SHALL stop all sources, wait for in-flight batches to drain (up to timeout), close all operators, and exit with code 0
