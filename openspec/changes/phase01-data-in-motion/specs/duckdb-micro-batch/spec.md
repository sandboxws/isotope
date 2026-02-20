## ADDED Requirements

### Requirement: DuckDB instance manager
The runtime SHALL manage isolated in-memory DuckDB instances (`:memory:`) per operator. Each parallel operator instance SHALL have its own DuckDB instance. Instances SHALL be created on `Open()` and destroyed on `Close()`.

#### Scenario: Isolated DuckDB instances per operator
- **WHEN** an operator with `parallelism: 4` uses DuckDB micro-batch execution
- **THEN** 4 independent DuckDB `:memory:` instances SHALL be created, with no shared state between them

#### Scenario: Instance cleanup on close
- **WHEN** an operator is closed
- **THEN** its DuckDB instance SHALL be destroyed and all memory reclaimed

### Requirement: Arrow to DuckDB zero-copy bridge
The runtime SHALL register Arrow RecordBatches as DuckDB views via `RegisterView(batch, "input")` for zero-copy data transfer from Arrow to DuckDB. Query results SHALL be read back as Arrow RecordBatches via `QueryContext` returning an `arrow.RecordReader`.

#### Scenario: Zero-copy roundtrip
- **WHEN** an Arrow RecordBatch with 10,000 rows is registered as a DuckDB view and queried with `SELECT * FROM input`
- **THEN** the returned Arrow RecordBatch SHALL contain identical data without serialization/deserialization overhead

#### Scenario: Aggregate query on Arrow data
- **WHEN** a RecordBatch is registered and queried with `SELECT product_id, SUM(amount) FROM input GROUP BY product_id`
- **THEN** the result SHALL be a new Arrow RecordBatch with the aggregated results

### Requirement: Micro-batch operator base
The runtime SHALL provide a base micro-batch operator that: (1) collects incoming Arrow RecordBatches into a buffer, (2) on a trigger (watermark, count, or time interval), flushes the buffer to DuckDB via `RegisterView`, (3) executes a configured SQL query, (4) emits the result as Arrow RecordBatches downstream.

#### Scenario: Collect and flush on trigger
- **WHEN** a micro-batch operator receives 5 RecordBatches and the flush trigger fires
- **THEN** all 5 batches SHALL be concatenated, registered as "input" in DuckDB, the SQL executed, and results emitted

### Requirement: Build tag for optional DuckDB
DuckDB integration SHALL be gated behind Go build tags (`//go:build duckdb`). When compiled without the `duckdb` tag, any operator configured with `DUCKDB_MICRO_BATCH` strategy SHALL fall back to an error indicating DuckDB is not available, or use an Arrow-native fallback if one exists.

#### Scenario: Build without DuckDB
- **WHEN** the runtime is compiled without `-tags duckdb`
- **THEN** operators requiring DuckDB SHALL return a clear error: "DuckDB execution strategy requires building with -tags duckdb"

#### Scenario: Build with DuckDB
- **WHEN** the runtime is compiled with `-tags duckdb`
- **THEN** DuckDB micro-batch operators SHALL function with full Arrow zero-copy bridge support

### Requirement: DuckDB memory limits
Each DuckDB instance SHALL have a configurable `memory_limit` to prevent unbounded allocation in the C allocator (invisible to Go's GC). The default limit SHALL be 256MB per instance.

#### Scenario: Memory limit enforcement
- **WHEN** a DuckDB query attempts to use more memory than the configured limit
- **THEN** DuckDB SHALL return an out-of-memory error that the operator propagates as a Go error
