## 1. Project Foundation & Protobuf Contract

- [ ] 1.1 Initialize monorepo: `pnpm-workspace.yaml`, root `package.json`, `.gitignore`, `CLAUDE.md`
- [ ] 1.2 Create `proto/isotope/v1/plan.proto` with ExecutionPlan, OperatorNode, Edge, Schema messages
- [ ] 1.3 Create `proto/isotope/v1/operators.proto` with all operator config messages (KafkaSourceConfig, FilterConfig, MapConfig, etc.)
- [ ] 1.4 Create `proto/isotope/v1/schema.proto` with SchemaField, ArrowType enum, WatermarkConfig
- [ ] 1.5 Set up `buf.yaml` and `buf.gen.yaml` for TypeScript (`@bufbuild/protobuf`) and Go (`protoc-gen-go`) code generation
- [ ] 1.6 Run `buf generate` and verify generated TypeScript stubs in `packages/dsl/src/generated/`
- [ ] 1.7 Run `buf generate` and verify generated Go stubs in `runtime/internal/proto/`

## 2. Go Runtime Core

- [ ] 2.1 Initialize Go module: `runtime/go.mod` with dependencies (arrow-go, franz-go, vitess, pebble)
- [ ] 2.2 Implement plan loader: read serialized Protobuf file → deserialize to in-memory ExecutionPlan
- [ ] 2.3 Implement plan validator: check schema consistency across edges, verify no DAG cycles, validate operator configs
- [ ] 2.4 Define `Operator` interface: `Open`, `ProcessBatch`, `ProcessWatermark`, `ProcessCheckpointBarrier`, `Close`
- [ ] 2.5 Define `OperatorContext` with metrics, logger, and operator metadata
- [ ] 2.6 Implement execution engine: build operator DAG from plan, create goroutines per operator instance, wire buffered channels
- [ ] 2.7 Implement operator chaining: fuse FORWARD-connected operators into single goroutines
- [ ] 2.8 Implement Arrow RecordBatch helpers: `batch.Column(name)`, `batch.Filter(mask)`, `batch.Project(cols...)`
- [ ] 2.9 Implement memory leak detector for tests using a tracking Arrow allocator
- [ ] 2.10 Implement graceful shutdown: SIGTERM handler, source stop, drain, close, timeout
- [ ] 2.11 Create `cmd/isotope-runtime/main.go` entry point: load plan from file, build engine, run

## 3. Expression Evaluator

- [ ] 3.1 Integrate `vitessio/vitess` sqlparser: parse SQL expression string → AST
- [ ] 3.2 Implement AST walker that dispatches to Arrow compute kernels for column references and literals
- [ ] 3.3 Implement binary comparison operators: `=`, `!=`, `>`, `<`, `>=`, `<=` via Arrow compute
- [ ] 3.4 Implement arithmetic operators: `+`, `-`, `*`, `/`, `%` via Arrow compute
- [ ] 3.5 Implement logical operators: `AND`, `OR`, `NOT` via Arrow compute
- [ ] 3.6 Implement `IS NULL` / `IS NOT NULL` checks
- [ ] 3.7 Implement string functions: `UPPER`, `LOWER`, `TRIM`, `CONCAT`, `SUBSTRING`
- [ ] 3.8 Implement `REGEXP_EXTRACT(col, pattern, group)` using Go regexp on Arrow string arrays
- [ ] 3.9 Implement `CASE WHEN ... THEN ... ELSE ... END` expression evaluation
- [ ] 3.10 Implement `COALESCE(a, b, ...)` expression evaluation
- [ ] 3.11 Implement type coercion for mixed-type operations (Int32+Int64→Int64, Int+Float→Float)
- [ ] 3.12 Write tests for all expression types with edge cases (nulls, empty strings, overflow)

## 4. Stateless Operators (Arrow-Native)

- [ ] 4.1 Implement Filter operator: evaluate condition → boolean mask → `arrow.Record.Filter(mask)`
- [ ] 4.2 Implement Map operator: evaluate column mappings → build new RecordBatch with projected columns
- [ ] 4.3 Implement FlatMap operator: unnest array column with row replication
- [ ] 4.4 Implement Rename operator: create new schema with renamed columns, reuse data arrays
- [ ] 4.5 Implement Drop operator: project away specified columns
- [ ] 4.6 Implement Cast operator: use Arrow cast functions for type conversion
- [ ] 4.7 Implement Union operator: merge batches from multiple inputs in arrival order
- [ ] 4.8 Implement Route operator: evaluate branch conditions, split batch by boolean masks
- [ ] 4.9 Write integration tests: each operator with varied RecordBatch sizes (1, 100, 4096, 8192 rows)

## 5. DuckDB Micro-Batch Infrastructure

- [ ] 5.1 Add `duckdb/duckdb-go` dependency with `//go:build duckdb` build tag
- [ ] 5.2 Implement DuckDB instance manager: create/destroy isolated `:memory:` instances per operator
- [ ] 5.3 Implement Arrow→DuckDB bridge: `RegisterView(batch, "input")` for zero-copy data ingestion
- [ ] 5.4 Implement DuckDB→Arrow bridge: `QueryContext` returning `arrow.RecordReader` for zero-copy results
- [ ] 5.5 Implement micro-batch operator base: collect batches → flush trigger → RegisterView → SQL → emit
- [ ] 5.6 Configure DuckDB `memory_limit` per instance (default 256MB)
- [ ] 5.7 Implement build-tag fallback: error message when DuckDB operators used without `-tags duckdb`
- [ ] 5.8 Write roundtrip tests: Arrow→DuckDB→Arrow with various data types (Int64, String, Timestamp, Boolean, Nullable)
- [ ] 5.9 Benchmark DuckDB overhead: measure query latency at 100, 1K, 10K, 100K record batch sizes

## 6. Kafka Connectors

- [ ] 6.1 Implement Kafka source: `franz-go` consumer, JSON deserialization, RecordBatch emission
- [ ] 6.2 Implement consumer group offset management and configurable startup mode (earliest/latest)
- [ ] 6.3 Implement Kafka sink: RecordBatch → JSON serialization, `franz-go` producer, key-by partitioning
- [ ] 6.4 Implement Generator source: synthetic data at configurable rows/sec with max_rows limit
- [ ] 6.5 Implement Console sink: formatted table output to stdout with max_rows truncation
- [ ] 6.6 Write integration tests using testcontainers (embedded Kafka) for source/sink roundtrip

## 7. TypeScript DSL

- [ ] 7.1 Initialize `packages/dsl/` with `package.json`, `tsconfig.json`, build tooling
- [ ] 7.2 Port core types: ConstructNode, OperatorType, SchemaDefinition, FieldType
- [ ] 7.3 Port JSX runtime: `createElement()` → ConstructNode tree construction
- [ ] 7.4 Port Schema and Field builders: `Schema()`, `Field.BIGINT()`, `Field.STRING()`, etc.
- [ ] 7.5 Port SynthContext: topological sort, cycle detection, schema validation, operator ID assignment
- [ ] 7.6 Port all component factories: Pipeline, KafkaSource, Filter, Map, FlatMap, all joins, all windows, Route, etc.
- [ ] 7.7 Implement type-safe column references via TypeScript generics where schemas are statically known
- [ ] 7.8 Write unit tests for all components and SynthContext validation

## 8. Plan Compiler

- [ ] 8.1 Implement `plan-compiler.ts`: ConstructNode tree → Protobuf ExecutionPlan serialization
- [ ] 8.2 Implement schema-resolver: propagate schemas through DAG (source→transform→sink)
- [ ] 8.3 Implement shuffle planner: assign FORWARD/HASH/BROADCAST/ROUND_ROBIN per edge
- [ ] 8.4 Implement execution strategy assignment: ARROW_NATIVE for stateless, DUCKDB_MICRO_BATCH for windowed SQL
- [ ] 8.5 Implement source location embedding: TSX file/line/column → OperatorNode.source_location
- [ ] 8.6 Implement SQL expression validation pass: parse SQL strings, check column references against schemas
- [ ] 8.7 Write roundtrip tests: TSX → synth → Protobuf → Go load → validate (lossless)

## 9. CLI

- [ ] 9.1 Initialize `packages/cli/` with `package.json`, entry point, command parser
- [ ] 9.2 Implement `isotope new <name>`: scaffold project with sample pipeline, package.json, tsconfig
- [ ] 9.3 Implement `isotope synth`: find TSX files, run JSX runtime, invoke plan-compiler, write .pb files
- [ ] 9.4 Implement `isotope dev`: generate Docker Compose (Kafka KRaft + runtime), start, watch for changes
- [ ] 9.5 Implement `isotope inspect`: load .pb file, dump operators/edges/schemas/DAG visualization
- [ ] 9.6 Implement `isotope inspect --json` for machine-readable output
- [ ] 9.7 Write CLI integration tests for each command

## 10. YSB Benchmark

- [ ] 10.1 Implement YSB data generator (Go or containerized): configurable event rate, ad-event schema
- [ ] 10.2 Implement YSB pipeline in TSX: KafkaSource → Filter → Map → TumbleWindow → Count → KafkaSink
- [ ] 10.3 Implement YSB pipeline in Go API for comparison
- [ ] 10.4 Create `docker/benchmark/docker-compose.yml`: 3 Kafka brokers, runtime, Prometheus, Grafana
- [ ] 10.5 Create Grafana dashboard JSON: throughput, latency, GC pauses, memory
- [ ] 10.6 Create `docker/benchmark/scripts/run-ysb.sh`: automated benchmark at 100K, 500K, 1M events/sec
- [ ] 10.7 Add Prometheus metrics to Go runtime: throughput counter, latency histogram, GC pause summary
- [ ] 10.8 Run benchmarks and record baseline: throughput, p50/p95/p99 latency, GC distribution
- [ ] 10.9 Profile and identify bottlenecks: CPU flamegraph, memory allocation hotspots

## 11. Documentation (Foundations Chapters)

- [ ] 11.1 Create `docs/content/docs/foundations/index.mdx`: section landing page
- [ ] 11.2 Write `foundations/goroutines-and-channels.mdx`: M:N scheduling, channel semantics, select, WaitGroups
- [ ] 11.3 Write `foundations/arrow-columnar-model.mdx`: column-major layout, null bitmaps, dictionary encoding
- [ ] 11.4 Write `foundations/arrow-memory-management.mdx`: Retain/Release, allocators, pool reuse, leak detection
- [ ] 11.5 Write `foundations/protobuf-as-contract.mdx`: IDL design, field numbers, wire format, evolution
- [ ] 11.6 Write `foundations/operator-model.mdx`: Operator interface, Open/Process/Close lifecycle, chaining
- [ ] 11.7 Write `foundations/kafka-consumer-internals.mdx`: consumer groups, offsets, rebalancing
- [ ] 11.8 Write `foundations/expression-evaluation.mdx`: SQL parsing, AST walking, Arrow kernel dispatch
- [ ] 11.9 Write `foundations/batch-size-tuning.mdx`: amortization, GC pressure, cache locality, latency percentiles
- [ ] 11.10 Write `foundations/benchmarking-streaming-systems.mdx`: YSB design, metrics, Coordinated Omission
- [ ] 11.11 Write `foundations/duckdb-micro-batch.mdx`: DuckDB architecture, Arrow bridge, micro-batch tuning

## 12. Integration & Verification

- [ ] 12.1 End-to-end test: TSX pipeline → `isotope synth` → Go runtime → Kafka source → Filter → Map → Kafka sink
- [ ] 12.2 Verify `isotope dev` runs the full pipeline with Docker Compose
- [ ] 12.3 Verify expression evaluator handles: comparisons, arithmetic, UPPER, COALESCE, CASE WHEN, REGEXP_EXTRACT
- [ ] 12.4 Verify memory leak detector catches intentionally leaked RecordBatches
- [ ] 12.5 Verify DuckDB Arrow roundtrip produces correct results with all supported types
- [ ] 12.6 Verify YSB benchmark: ≥100K events/sec sustained, p99 latency measured
- [ ] 12.7 Verify all 10 documentation chapters build and render correctly
- [ ] 12.8 Run full test suite and fix any failures
