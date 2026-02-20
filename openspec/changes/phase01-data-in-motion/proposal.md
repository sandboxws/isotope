## Why

Isotope needs its foundational data path: the ability to read events from Kafka, process them through stateless operators (Filter, Map, FlatMap, Union, Route), and write results to sinks — all powered by a Go runtime that executes Apache Arrow RecordBatches. This is Phase 1 of 6. Without a working data path, no subsequent phase (state, checkpointing, distribution, SQL, production) can exist. The TypeScript DSL must also be ported from FlinkReactor so users can define pipelines in TSX and compile them to Protobuf execution plans that the Go runtime interprets.

Additionally, this phase establishes the DuckDB micro-batch infrastructure alongside Arrow-native execution — giving the runtime two execution strategies from the start. A Yahoo Streaming Benchmark (YSB) validates the data path end-to-end with published throughput and latency numbers.

## What Changes

- Define the Protobuf `ExecutionPlan` contract (`.proto` files) shared between TypeScript and Go
- Build the Go runtime core: plan loader, execution engine (goroutine pool + channels), operator interface, Arrow RecordBatch data model
- Implement the expression evaluator: `vitess/sqlparser` → Arrow compute kernel dispatch
- Implement Arrow-native stateless operators: Filter, Map, FlatMap, Rename, Drop, Cast, Union, Route
- Integrate DuckDB as an embedded micro-batch SQL engine with Arrow zero-copy bridge
- Build the DuckDB micro-batch operator base (collect → flush → execute → emit)
- Port the FlinkReactor TypeScript DSL: core types, JSX runtime, schema, SynthContext, all components
- Build `plan-compiler.ts`: ConstructNode tree → Protobuf ExecutionPlan
- Build `schema-resolver.ts`: schema propagation through the operator DAG
- Implement Kafka source/sink connectors (franz-go), Generator source, Console sink
- Build the CLI: `isotope new`, `isotope synth`, `isotope dev`, `isotope inspect`
- Implement the Yahoo Streaming Benchmark (YSB) with Docker Compose infrastructure
- Write 10 documentation chapters under `docs/content/docs/foundations/`

## Capabilities

### New Capabilities
- `protobuf-contract`: Protobuf `.proto` definitions for ExecutionPlan, operators, schemas, edges, and cross-language code generation (buf/protoc)
- `go-runtime-core`: Go execution engine — plan loader/validator, goroutine pool, buffered channels, operator chaining, Arrow RecordBatch data model, basic backpressure (channel blocking + buffer sizing)
- `expression-evaluator`: SQL expression parsing via vitess/sqlparser and dispatch to Arrow compute kernels (comparisons, arithmetic, string functions, CASE WHEN, COALESCE, REGEXP_EXTRACT)
- `stateless-operators`: Arrow-native operators — Filter, Map, FlatMap, Rename, Drop, Cast, Union, Route — processing RecordBatches without state
- `duckdb-micro-batch`: DuckDB instance manager, Arrow↔DuckDB zero-copy bridge (RegisterView/QueryContext), micro-batch operator base class, build tag support (`//go:build duckdb`)
- `ts-dsl`: TypeScript DSL ported from FlinkReactor — core types, JSX runtime, SchemaDefinition, Field builders, SynthContext, all component factories
- `plan-compiler`: ConstructNode tree → Protobuf ExecutionPlan compilation, schema resolution/propagation, shuffle planning, execution strategy assignment per operator
- `kafka-connectors`: Kafka source (franz-go consumer with offset management) and Kafka sink (franz-go producer with key-by partitioning), Generator source, Console sink
- `cli-tooling`: CLI commands — `isotope new` (scaffold), `isotope synth` (compile), `isotope dev` (Docker Compose), `isotope inspect` (dump plan/schemas/graph)
- `ysb-benchmark`: Yahoo Streaming Benchmark — data generator, pipeline (Kafka→Filter→KeyBy→TumbleWindow→Count→Kafka), Prometheus metrics, Docker Compose environment, baseline measurements
- `foundations-docs`: 10 documentation chapters covering goroutines/channels, Arrow columnar model, Arrow memory management, Protobuf as contract, operator model, Kafka consumer internals, expression evaluation, batch size tuning, benchmarking streaming systems, DuckDB micro-batch

### Modified Capabilities

_None — this is the initial phase; no existing capabilities to modify._

## Impact

- **New directories**: `proto/isotope/v1/`, `runtime/` (Go module), `packages/dsl/`, `packages/cli/`, `docs/content/docs/foundations/`, `examples/`, `docker/`
- **Dependencies**: Go 1.22+, `apache/arrow/go`, `cockroachdb/pebble`, `twmb/franz-go`, `vitessio/vitess`, `duckdb/duckdb-go` (optional via build tag), pnpm, `@bufbuild/protobuf`, TanStack Start, fumadocs
- **Build system**: pnpm workspace (root), Go modules (`runtime/`), protoc/buf code generation, Docker Compose for dev environment
- **APIs introduced**: Protobuf ExecutionPlan (the TS↔Go contract), Go `Operator` interface, TypeScript DSL public API (`@isotope/dsl`), CLI commands
