## 1. Project Foundation & Protobuf Contract

- [x] 1.1 Initialize monorepo: `pnpm-workspace.yaml`, root `package.json`, `.gitignore`, `CLAUDE.md`
- [x] 1.2 Create `proto/isotope/v1/plan.proto` with ExecutionPlan, OperatorNode, Edge, Schema messages
- [x] 1.3 Create `proto/isotope/v1/operators.proto` with all operator config messages (KafkaSourceConfig, FilterConfig, MapConfig, etc.)
- [x] 1.4 Create `proto/isotope/v1/schema.proto` with SchemaField, ArrowType enum, WatermarkConfig
- [x] 1.5 Set up `buf.yaml` and `buf.gen.yaml` for TypeScript (`@bufbuild/protobuf`) and Go (`protoc-gen-go`) code generation
- [x] 1.6 Run `buf generate` and verify generated TypeScript stubs in `packages/dsl/src/generated/`
- [x] 1.7 Run `buf generate` and verify generated Go stubs in `runtime/internal/proto/`

## 2. Go Runtime Core

- [x] 2.1 Initialize Go module: `runtime/go.mod` with dependencies (arrow-go, franz-go, vitess, pebble)
- [x] 2.2 Implement plan loader: read serialized Protobuf file → deserialize to in-memory ExecutionPlan
- [x] 2.3 Implement plan validator: check schema consistency across edges, verify no DAG cycles, validate operator configs
- [x] 2.4 Define `Operator` interface: `Open`, `ProcessBatch`, `ProcessWatermark`, `ProcessCheckpointBarrier`, `Close`
- [x] 2.5 Define `OperatorContext` with metrics, logger, and operator metadata
- [x] 2.6 Implement execution engine: build operator DAG from plan, create goroutines per operator instance, wire buffered channels
- [x] 2.7 Implement operator chaining: fuse FORWARD-connected operators into single goroutines
- [x] 2.8 Implement Arrow RecordBatch helpers: `batch.Column(name)`, `batch.Filter(mask)`, `batch.Project(cols...)`
- [x] 2.9 Implement memory leak detector for tests using a tracking Arrow allocator
- [x] 2.10 Implement graceful shutdown: SIGTERM handler, source stop, drain, close, timeout
- [x] 2.11 Create `cmd/isotope-runtime/main.go` entry point: load plan from file, build engine, run

## 3. Expression Evaluator

- [x] 3.1 Integrate `vitessio/vitess` sqlparser: parse SQL expression string → AST
- [x] 3.2 Implement AST walker that dispatches to Arrow compute kernels for column references and literals
- [x] 3.3 Implement binary comparison operators: `=`, `!=`, `>`, `<`, `>=`, `<=` via Arrow compute
- [x] 3.4 Implement arithmetic operators: `+`, `-`, `*`, `/`, `%` via Arrow compute
- [x] 3.5 Implement logical operators: `AND`, `OR`, `NOT` via Arrow compute
- [x] 3.6 Implement `IS NULL` / `IS NOT NULL` checks
- [x] 3.7 Implement string functions: `UPPER`, `LOWER`, `TRIM`, `CONCAT`, `SUBSTRING`
- [x] 3.8 Implement `REGEXP_EXTRACT(col, pattern, group)` using Go regexp on Arrow string arrays
- [x] 3.9 Implement `CASE WHEN ... THEN ... ELSE ... END` expression evaluation
- [x] 3.10 Implement `COALESCE(a, b, ...)` expression evaluation
- [x] 3.11 Implement type coercion for mixed-type operations (Int32+Int64→Int64, Int+Float→Float)
- [x] 3.12 Write tests for all expression types with edge cases (nulls, empty strings, overflow)

## 4. Stateless Operators (Arrow-Native)

- [x] 4.1 Implement Filter operator: evaluate condition → boolean mask → `arrow.Record.Filter(mask)`
- [x] 4.2 Implement Map operator: evaluate column mappings → build new RecordBatch with projected columns
- [x] 4.3 Implement FlatMap operator: unnest array column with row replication
- [x] 4.4 Implement Rename operator: create new schema with renamed columns, reuse data arrays
- [x] 4.5 Implement Drop operator: project away specified columns
- [x] 4.6 Implement Cast operator: use Arrow cast functions for type conversion
- [x] 4.7 Implement Union operator: merge batches from multiple inputs in arrival order
- [x] 4.8 Implement Route operator: evaluate branch conditions, split batch by boolean masks
- [x] 4.9 Write integration tests: each operator with varied RecordBatch sizes (1, 100, 4096, 8192 rows)

## 5. DuckDB Micro-Batch Infrastructure

- [x] 5.1 Add `duckdb/duckdb-go` dependency with `//go:build duckdb` build tag
- [x] 5.2 Implement DuckDB instance manager: create/destroy isolated `:memory:` instances per operator
- [x] 5.3 Implement Arrow→DuckDB bridge: `RegisterView(batch, "input")` for zero-copy data ingestion
- [x] 5.4 Implement DuckDB→Arrow bridge: `QueryContext` returning `arrow.RecordReader` for zero-copy results
- [x] 5.5 Implement micro-batch operator base: collect batches → flush trigger → RegisterView → SQL → emit
- [x] 5.6 Configure DuckDB `memory_limit` per instance (default 256MB)
- [x] 5.7 Implement build-tag fallback: error message when DuckDB operators used without `-tags duckdb`
- [x] 5.8 Write roundtrip tests: Arrow→DuckDB→Arrow with various data types (Int64, String, Timestamp, Boolean, Nullable)
- [x] 5.9 Benchmark DuckDB overhead: measure query latency at 100, 1K, 10K, 100K record batch sizes

## 6. Kafka Connectors

- [x] 6.1 Implement Kafka source: `franz-go` consumer, JSON deserialization, RecordBatch emission
- [x] 6.2 Implement consumer group offset management and configurable startup mode (earliest/latest)
- [x] 6.3 Implement Kafka sink: RecordBatch → JSON serialization, `franz-go` producer, key-by partitioning
- [x] 6.4 Implement Generator source: synthetic data at configurable rows/sec with max_rows limit
- [x] 6.5 Implement Console sink: formatted table output to stdout with max_rows truncation
- [x] 6.6 Write integration tests using testcontainers (embedded Kafka) for source/sink roundtrip

## 7. TypeScript DSL

- [x] 7.1 Initialize `packages/dsl/` with `package.json`, `tsconfig.json`, build tooling
- [x] 7.2 Port core types: ConstructNode, OperatorType, SchemaDefinition, FieldType
- [x] 7.3 Port JSX runtime: `createElement()` → ConstructNode tree construction
- [x] 7.4 Port Schema and Field builders: `Schema()`, `Field.BIGINT()`, `Field.STRING()`, etc.
- [x] 7.5 Port SynthContext: topological sort, cycle detection, schema validation, operator ID assignment
- [x] 7.6 Port all component factories: Pipeline, KafkaSource, Filter, Map, FlatMap, all joins, all windows, Route, etc.
- [x] 7.7 Implement type-safe column references via TypeScript generics where schemas are statically known
- [x] 7.8 Write unit tests for all components and SynthContext validation

## 8. Plan Compiler

- [x] 8.1 Implement `plan-compiler.ts`: ConstructNode tree → Protobuf ExecutionPlan serialization
- [x] 8.2 Implement schema-resolver: propagate schemas through DAG (source→transform→sink)
- [x] 8.3 Implement shuffle planner: assign FORWARD/HASH/BROADCAST/ROUND_ROBIN per edge
- [x] 8.4 Implement execution strategy assignment: ARROW_NATIVE for stateless, DUCKDB_MICRO_BATCH for windowed SQL
- [x] 8.5 Implement source location embedding: TSX file/line/column → OperatorNode.source_location
- [x] 8.6 Implement SQL expression validation pass: parse SQL strings, check column references against schemas
- [x] 8.7 Write roundtrip tests: TSX → synth → Protobuf → Go load → validate (lossless)

## 9. CLI

- [x] 9.1 Initialize `packages/cli/` with `package.json`, entry point, command parser
- [x] 9.2 Implement `isotope new <name>`: scaffold project with sample pipeline, package.json, tsconfig
- [x] 9.3 Implement `isotope synth`: find TSX files, run JSX runtime, invoke plan-compiler, write .pb files
- [x] 9.4 Implement `isotope dev`: generate Docker Compose (Kafka KRaft + runtime), start, watch for changes
- [x] 9.5 Implement `isotope inspect`: load .pb file, dump operators/edges/schemas/DAG visualization
- [x] 9.6 Implement `isotope inspect --json` for machine-readable output
- [x] 9.7 Write CLI integration tests for each command

## 10. YSB Benchmark

- [x] 10.1 Implement YSB data generator (Go or containerized): configurable event rate, ad-event schema
- [x] 10.2 Implement YSB pipeline in TSX: KafkaSource → Filter → Map → TumbleWindow → Count → KafkaSink
- [x] 10.3 Implement YSB pipeline in Go API for comparison
- [x] 10.4 Create `docker/benchmark/docker-compose.yml`: 3 Kafka brokers, runtime, Prometheus, Grafana
- [x] 10.5 Create Grafana dashboard JSON: throughput, latency, GC pauses, memory
- [x] 10.6 Create `docker/benchmark/scripts/run-ysb.sh`: automated benchmark at 100K, 500K, 1M events/sec
- [x] 10.7 Add Prometheus metrics to Go runtime: throughput counter, latency histogram, GC pause summary
- [ ] 10.8 Run benchmarks and record baseline: throughput, p50/p95/p99 latency, GC distribution
- [ ] 10.9 Profile and identify bottlenecks: CPU flamegraph, memory allocation hotspots

## 11. Documentation (Foundations Chapters)

- [x] 11.1 Create `docs/content/docs/foundations/index.mdx`: section landing page
- [x] 11.2 Write `foundations/goroutines-and-channels.mdx`: M:N scheduling, channel semantics, select, WaitGroups
- [x] 11.3 Write `foundations/arrow-columnar-model.mdx`: column-major layout, null bitmaps, dictionary encoding
- [x] 11.4 Write `foundations/arrow-memory-management.mdx`: Retain/Release, allocators, pool reuse, leak detection
- [x] 11.5 Write `foundations/protobuf-as-contract.mdx`: IDL design, field numbers, wire format, evolution
- [x] 11.6 Write `foundations/operator-model.mdx`: Operator interface, Open/Process/Close lifecycle, chaining
- [x] 11.7 Write `foundations/kafka-consumer-internals.mdx`: consumer groups, offsets, rebalancing
- [x] 11.8 Write `foundations/expression-evaluation.mdx`: SQL parsing, AST walking, Arrow kernel dispatch
- [x] 11.9 Write `foundations/batch-size-tuning.mdx`: amortization, GC pressure, cache locality, latency percentiles
- [x] 11.10 Write `foundations/benchmarking-streaming-systems.mdx`: YSB design, metrics, Coordinated Omission
- [x] 11.11 Write `foundations/duckdb-micro-batch.mdx`: DuckDB architecture, Arrow bridge, micro-batch tuning

## 12. Integration & Verification

- [x] 12.1 End-to-end test: TSX pipeline → `isotope synth` → Go runtime → Kafka source → Filter → Map → Kafka sink
- [ ] 12.2 Verify `isotope dev` runs the full pipeline with Docker Compose
- [x] 12.3 Verify expression evaluator handles: comparisons, arithmetic, UPPER, COALESCE, CASE WHEN, REGEXP_EXTRACT
- [x] 12.4 Verify memory leak detector catches intentionally leaked RecordBatches
- [x] 12.5 Verify DuckDB Arrow roundtrip produces correct results with all supported types
- [ ] 12.6 Verify YSB benchmark: ≥100K events/sec sustained, p99 latency measured
- [x] 12.7 Verify all 10 documentation chapters build and render correctly
- [x] 12.8 Run full test suite and fix any failures
