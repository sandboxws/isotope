## Context

Isotope is a streaming framework built from scratch as both a working runtime and an educational course. Phase 1 establishes the foundational data path: the ability to read from Kafka, process through stateless operators, and write to sinks. The architecture is a two-language system: TypeScript DSL for pipeline definition (compiled to Protobuf), Go runtime for execution (Arrow-native).

The project ports the TSX DSL from an existing project (FlinkReactor) where pipelines compile to Flink SQL. Here, the same TSX syntax compiles to Protobuf `ExecutionPlan` messages consumed by a custom Go runtime. This is a fundamentally different compilation target — the tree model may need refactoring where it assumes SQL generation.

The Go runtime introduces a dual execution strategy: Arrow-native compute kernels for stateless operators (fast, no SQL overhead) and DuckDB micro-batch execution for SQL-like operations within windows (correct, complete function coverage). Phase 1 builds both paths.

## Goals / Non-Goals

**Goals:**
- End-to-end data path: TSX → Protobuf → Go runtime → Kafka output
- Arrow-native stateless operators at high throughput (target: 100K+ events/sec)
- DuckDB micro-batch infrastructure validated with Arrow zero-copy bridge
- Expression evaluator covering common SQL expressions via vitess/sqlparser
- Developer workflow: `isotope new` → `isotope synth` → `isotope dev`
- YSB benchmark with published throughput and latency numbers
- 10 documentation chapters written as course content

**Non-Goals:**
- Stateful operators (Phase 2) — no Pebble state backend, no keyed state
- Windowed aggregations beyond YSB proof-of-concept — full window semantics are Phase 2
- Checkpointing and fault tolerance (Phase 3)
- Multi-node distribution (Phase 4)
- SQL query compilation layer (Phase 5)
- Kubernetes operator (Phase 6)
- Exactly-once semantics — at-most-once is acceptable for Phase 1
- Avro/Protobuf deserialization in Kafka connector — JSON only initially

## Decisions

### Decision 1: Protobuf as the TS↔Go contract (not JSON, not gRPC)

**Choice:** Protobuf binary serialization for execution plans, with `@bufbuild/protobuf` (TS) and `buf`/`protoc-gen-go` (Go).

**Rationale:** Protobuf provides schema evolution (field numbers), cross-language type safety, efficient binary serialization, and a single source of truth (`.proto` files). JSON is too loose for a compiler contract — no schema enforcement, no type safety. gRPC is unnecessary since the plan is a file, not a service call.

**Alternatives considered:**
- JSON Schema — weaker type safety, no binary format, no code generation
- FlatBuffers — zero-copy access but more complex schema language, less ecosystem tooling
- Cap'n Proto — similar to FlatBuffers; less Go ecosystem support

### Decision 2: Raw SQL strings for expressions (not structured Expression proto)

**Choice:** All operator expression fields (filter conditions, map expressions, aggregate functions) are raw SQL strings parsed at runtime by `vitess/sqlparser`.

**Rationale:** A structured Expression protobuf (with nodes for BinaryOp, FunctionCall, ColumnRef, etc.) seems clean but is a trap: you inevitably build an incomplete expression language that can't handle real SQL, and end up needing a SQL parser anyway. Starting with SQL strings avoids this trap. The Go runtime parses them once via vitess/sqlparser and dispatches to Arrow compute kernels.

**Tradeoff:** Type-checking is deferred to runtime. The TypeScript compiler can't validate that `amount > 100` refers to a real column. Mitigation: add a validation pass in the plan-compiler that parses SQL strings and checks column references against schemas.

### Decision 3: Arrow RecordBatch as the universal data format

**Choice:** All inter-operator data flows as Apache Arrow RecordBatches (columnar, batch-oriented).

**Rationale:** Arrow's columnar format enables vectorized processing — a single `compute.Greater` call processes an entire column at once. This amortizes function call overhead and enables SIMD. The Arrow Go library provides memory allocators with reference counting for deterministic cleanup.

**Tradeoff:** Operators that need per-row state (joins, dedup) must still iterate rows within batches. But Phase 1 has only stateless operators, where columnar processing is purely beneficial.

### Decision 4: Dual execution strategy (Arrow-native + DuckDB micro-batch)

**Choice:** Stateless operators run as Arrow-native compute kernels. SQL-like operations within windows run in isolated DuckDB instances via zero-copy Arrow bridge.

**Rationale:** Arrow-native is faster for stateless ops (no SQL parsing overhead). DuckDB provides ~500 SQL functions, hash aggregation, hash joins, and window functions — reimplementing these in Go would take months. The zero-copy bridge (`RegisterView`/`QueryContext`) means no serialization penalty.

**Tradeoff:** DuckDB adds CGO dependency (~30MB binary), C allocator invisible to Go GC, cross-compilation complexity. Mitigated by making DuckDB optional via build tags (`//go:build duckdb`).

### Decision 5: franz-go for Kafka (not confluent-kafka-go, not sarama)

**Choice:** `twmb/franz-go` for Kafka source/sink.

**Rationale:** franz-go is pure Go (no CGO, unlike confluent-kafka-go which wraps librdkafka). It supports modern Kafka features (KRaft, transactions), has excellent documentation, and allows fine-grained offset management. sarama is in maintenance mode.

**Alternatives considered:**
- confluent-kafka-go — wraps librdkafka (C), adds CGO dependency (already have DuckDB CGO), more features but more complexity
- sarama (Shopify) — pure Go but maintenance mode, less actively developed

### Decision 6: vitess/sqlparser for expression parsing

**Choice:** `vitessio/vitess` sqlparser package for parsing SQL expressions in the Go runtime.

**Rationale:** vitess/sqlparser is the most complete MySQL-dialect SQL parser in Go. It produces a well-typed AST that's straightforward to walk for Arrow compute dispatch. It's battle-tested in production at scale (Vitess/PlanetScale).

**Tradeoff:** MySQL dialect doesn't include Flink-specific syntax (TUMBLE, HOP, SESSION functions). These will need parser extensions in Phase 5. For Phase 1, only standard SQL expressions are needed.

### Decision 7: Monorepo with pnpm workspaces + Go modules

**Choice:** Single repository with `pnpm-workspace.yaml` for TypeScript packages (`packages/dsl`, `packages/cli`, `docs`) and `go.mod` in `runtime/` for Go code.

**Rationale:** Monorepo keeps the Protobuf contract, TypeScript DSL, Go runtime, and documentation in sync. pnpm workspaces handle TypeScript inter-package dependencies. Go modules handle Go dependencies independently.

### Decision 8: Operator chaining for FORWARD edges

**Choice:** Adjacent operators connected by FORWARD shuffle edges execute in the same goroutine, passing RecordBatch pointers directly without channel overhead.

**Rationale:** Go channels add ~100ns per send/receive. For a chain of 3 stateless operators at 1M events/sec, that's 600ns overhead per batch just from channels. Chaining eliminates this. The plan-compiler determines chaining at compile time.

## Risks / Trade-offs

- **ConstructNode tree has SQL assumptions** → Budget 2 weeks for tree model refactoring. The FlinkReactor tree model uses VirtualRef, sibling-chaining, and reverse-nesting designed for SQL generation. Untangling for Protobuf may require deep refactoring.
- **Expression parser yak-shave** → Budget 3 weeks. vitess/sqlparser extension for unsupported functions is the primary risk. Start with the subset needed for YSB (comparisons, string equality) and expand incrementally.
- **Arrow Go API verbosity** → First operators will be 5x more code than expected. Build helper utilities early (`batch.Column("name")`, `batch.Filter(mask)`, `batch.Project(cols...)`).
- **DuckDB CGO build complexity** → Use pre-built static libraries, document build matrix, gate behind build tags.
- **DuckDB memory accounting** → Set `memory_limit` per instance (256MB default), track in Go memory accounting.
- **franz-go Kafka edge cases** → Consumer rebalancing, SASL auth, schema registry. Start with simplest config (JSON, no auth, auto-assign).
- **Benchmark numbers look bad vs Flink** → Document gaps honestly. Focus on identifying WHERE the bottleneck is via profiling.

## Open Questions

- Should the plan-compiler run as a TypeScript library call (imported by the CLI) or as a separate process invoked by the CLI? Library call is simpler but couples the CLI to the compiler.
- What batch size default? 1024 rows is safe but may not amortize Arrow overhead. 8192 may add latency. Need YSB benchmarks to decide.
- Should the Console sink support CSV output in addition to table format?
- For DuckDB build tags: should the fallback without DuckDB be an error, or should we provide Arrow-native fallback implementations for simple aggregates?
