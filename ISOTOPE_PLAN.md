# Isotope: Building a Streaming Framework from the Ground Up

## 1. Motivation & Goals

### Why Build This

This project exists for three reasons:

1. **Deep understanding of streaming systems** — Reading Flink's source code or the Dataflow Model paper teaches concepts. Building a streaming runtime from scratch — with state management, checkpointing, watermarks, and distributed execution — forces you to truly understand them. Every edge case in the Chandy-Lamport algorithm, every subtlety of watermark propagation, every tradeoff in LSM tree compaction becomes real when you implement it.

2. **Advanced Go proficiency** — Go's concurrency model (goroutines, channels, select), its memory model, its GC behavior under pressure, and its systems programming capabilities (unsafe, cgo boundaries, SIMD via assembly) are best learned by building something that pushes every one of these boundaries. A streaming runtime is one of the most demanding Go programs you can write.

3. **Streaming systems expertise** — The project produces not just code but a comprehensive course. Every phase ships documentation chapters that explain the concepts, algorithms, and tradeoffs involved. The finished result is both a working framework and a teaching resource — a portfolio piece that demonstrates depth of knowledge.

### Dual Output: Framework + Course

Every phase produces two things:

| Output | Description |
|--------|-------------|
| **Working code** | Go runtime + TypeScript DSL, tested end-to-end |
| **Documentation chapters** | Fumadocs site (TanStack Start) explaining every concept, algorithm, data structure, and design decision — written as a course |

The documentation site isn't an afterthought. It's structured as a progressive course: each chapter builds on previous ones, includes diagrams, references academic papers, and explains not just *what* was built but *why* each design choice was made and what alternatives were considered.

### Personal Portfolio Goals

- **GitHub presence**: A from-scratch streaming runtime in Go is a strong signal of systems engineering depth
- **Writing portfolio**: The course documentation demonstrates ability to explain complex distributed systems concepts clearly
- **Conference talks**: Each phase maps naturally to a conference talk or blog post series
- **Career positioning**: "Built a streaming runtime with Chandy-Lamport checkpointing and Arrow-native vectorized execution" is a strong differentiator

---

## 2. Architecture: TSX → Protobuf → Go Runtime

### The Compilation Pipeline

```
TSX Pipeline ──→ createElement() ──→ ConstructNode Tree (DAG)
                                          │
                                    ┌─────┴──────┐
                                    ▼             ▼
                              plan-compiler   (optional)
                                    │         sql-compiler
                                    ▼             │
                              Protobuf            ▼
                              ExecutionPlan   Flink SQL
                                    │         (legacy target)
                              ┌─────┴──────┐
                              ▼            ▼
                          Go Runtime    K8s Operator
                          (Arrow-native  (IsotopePipeline
                           execution)    CRD)
```

**What ports from FlinkReactor:**
- TSX JSX syntax and component APIs (`<KafkaSource>`, `<Filter>`, `<Map>`, etc.)
- `createElement()` → `ConstructNode` tree model
- `SchemaDefinition<T>` with `Field` builders
- `SynthContext` (DAG construction, topological sort, cycle detection, validation)
- CLI command structure (`new`, `synth`, `dev`, `deploy`)

**What's new:**
- `plan-compiler.ts`: ConstructNode → Protobuf `ExecutionPlan`
- Go runtime that interprets execution plans with Arrow RecordBatches
- Own state management (Pebble), checkpointing, backpressure, shuffle
- Own K8s operator (`IsotopePipeline` CRD)

### What Could Go Wrong: The Pivot

| Risk | Likelihood | Learning Impact | Mitigation |
|------|------------|-----------------|------------|
| **ConstructNode tree has baked-in SQL assumptions** — VirtualRef, sibling-chaining, and reverse-nesting patterns were designed FOR SQL generation. Untangling for Protobuf may require deep refactoring. | Medium | High — understanding compiler IR design | Budget 2 weeks for tree model refactoring. Document the differences as a chapter on intermediate representations. |
| **Expression coverage gap** — FlinkReactor passes SQL strings through verbatim. The Go runtime must evaluate them. Flink has ~200 functions, Arrow Go has ~40 kernels. | Very High | Very High — forces deep understanding of expression evaluation | Start with `raw_sql` everywhere (vitess/sqlparser in Go). Add structured expressions as optimization later. Document as a chapter on expression compilation. |
| **"Same API" is misleading** — SQL semantics differ (NULL handling, type coercion). Users from FlinkReactor will get different results. | High | Medium | Build conformance test suite. Document every semantic difference. Write a chapter on SQL edge cases. |

### FlinkReactor Port Strategy

The TypeScript DSL and CLI are not built from scratch — they are **ported from the existing FlinkReactor project** (`/opensource/flink-reactor/`). FlinkReactor is a production-quality TSX DSL that compiles pipelines to Flink SQL + Kubernetes CRDs. Isotope re-targets the same TSX syntax to compile to Protobuf ExecutionPlans consumed by the Go runtime.

This section documents exactly what ports, what needs adaptation, and what's new.

#### Source Project Inventory

FlinkReactor's TypeScript codebase (~5,000 lines) breaks into three tiers by portability:

| Tier | Lines | Description |
|------|-------|-------------|
| **Direct port** (~80% reuse) | ~2,000 | Core infra: types, JSX runtime, tree-utils, plugin system, config/environment |
| **Adapt & refactor** (~50% reuse) | ~1,500 | Components, schema system, SynthContext — remove Flink SQL assumptions |
| **Not ported** (replaced) | ~1,500 | SQL codegen, CRD codegen, connector registry, Flink version compat |

#### File-by-File Port Map

**Core (direct port → `packages/dsl/src/core/`)**

| FlinkReactor Source | Isotope Target | Changes |
|---------------------|----------------|---------|
| `src/core/types.ts` | `core/types.ts` | Replace `FlinkType` union with `ArrowType` enum. Replace `FlinkMajorVersion` with Isotope version. Keep `ConstructNode`, `NodeKind`, `Stream`, `BaseComponentProps` as-is. |
| `src/core/jsx-runtime.ts` | `core/jsx-runtime.ts` | Update `BUILTIN_KINDS` map to Isotope operators (add `GeneratorSource`, `ConsoleSink`; remove `PaimonSink`, `IcebergSink`, `CatalogSource`, Flink-only catalogs). Keep `createElement()`, `Fragment`, `jsx`/`jsxs`, ID generation, `toSqlIdentifier()`. |
| `src/core/tree-utils.ts` | `core/tree-utils.ts` | **100% reuse.** `mapTree`, `walkTree`, `findNodes`, `wrapNode`, `replaceChild` are generic. |
| `src/core/schema.ts` | `core/schema.ts` | Replace `FlinkType` validation (`isValidFlinkType`) with Arrow type validation. Adapt `Field` builders: `Field.BIGINT()` → Arrow INT64, `Field.TIMESTAMP(3)` → Arrow TIMESTAMP_MS, etc. Keep `Schema()` factory, `WatermarkDeclaration`, `PrimaryKeyDeclaration`. Remove `MetadataColumnDeclaration` (Flink Kafka metadata). |
| `src/core/synth-context.ts` | `core/synth-context.ts` | Keep DAG building (`addNode`, `addEdge`, `buildFromTree`), topological sort (Kahn's), cycle detection (DFS coloring). Remove `detectChangelogMismatch()` (Flink CDC concept). Adapt validation for Isotope operator constraints. |
| `src/core/config.ts` | `core/config.ts` | Replace `FlinkReactorConfig` with `IsotopeConfig`. Remove `flink.version`, `connectors.delivery`, Maven mirrors. Add `runtime.batchSize`, `runtime.duckdb`. Keep `defineConfig()` pattern, plugin configuration. |
| `src/core/environment.ts` | `core/environment.ts` | ~95% reuse. Replace `PipelineOverrides` Flink fields with Isotope equivalents. Keep `defineEnvironment()`, `resolveEnvironment()`, `discoverEnvironments()`. |
| `src/core/plugin.ts` | `core/plugin.ts` | Adapt plugin interface: replace `PluginSqlGenerator`/`PluginDdlGenerator` with `PluginPlanTransformer`. Keep component registration, tree transformers, validation hooks, lifecycle hooks. |
| `src/core/plugin-registry.ts` | `core/plugin-registry.ts` | ~95% reuse. Topological plugin ordering, uniqueness validation, `EMPTY_PLUGIN_CHAIN`. |
| `src/core/app.ts` | `core/app.ts` | Major refactor: replace `synthesizeApp()` SQL/CRD generation with `synthesizeApp()` → Protobuf ExecutionPlan generation. Keep config cascade logic, plugin integration points, multi-pipeline support. |

**Components (adapt → `packages/dsl/src/components/`)**

| FlinkReactor Source | Isotope Target | Changes |
|---------------------|----------------|---------|
| `src/components/pipeline.ts` | `components/pipeline.ts` | Replace `stateBackend: 'hashmap' \| 'rocksdb'` with `stateBackend: 'pebble' \| 'memory'`. Keep `mode`, `parallelism`, `checkpoint`, `restartStrategy`. Add `executionConfig` for Arrow-specific settings. |
| `src/components/sources.ts` | `components/sources.ts` | **KafkaSource**: Keep `topic`, `schema`, `watermark`, `startupMode`, `consumerGroup`. Remove `format` Flink options (debezium-json, canal-json, maxwell-json) — Isotope uses JSON only in Phase 1. Remove `inferChangelogMode()`. Add `bootstrapServers` as required prop. **JdbcSource**: Defer to Phase 2 (lookup joins). **GenericSource**: Remove (Flink escape hatch). Add **GeneratorSource**: `rowsPerSecond`, `maxRows`, `schema`. |
| `src/components/sinks.ts` | `components/sinks.ts` | **KafkaSink**: Keep `topic`, `bootstrapServers`. Remove Flink format options. Add `keyBy` for partitioning. **ConsoleSink**: New, `maxRows` prop. Remove `JdbcSink`, `FileSystemSink`, `PaimonSink`, `IcebergSink`, `GenericSink` (future phases). |
| `src/components/transforms.ts` | `components/transforms.ts` | **Filter**: 100% reuse (`condition` SQL string). **Map**: 100% reuse (`select` column mappings). **FlatMap**: 100% reuse (`unnest` + `as`). **Aggregate**: 100% reuse (`groupBy` + `select`). **Union**: 100% reuse. **Deduplicate**: Keep, defer full implementation to Phase 2. |
| `src/components/field-transforms.ts` | `components/field-transforms.ts` | **Rename, Drop, Cast, Coalesce, AddField**: ~95% reuse. Replace `FlinkType` references with Arrow types in Cast. Remove `safe` prop (TRY_CAST is Flink-specific). |
| `src/components/route.ts` | `components/route.ts` | **100% reuse.** `Route`, `Route.Branch`, `Route.Default` are DAG-only constructs. |
| `src/components/joins.ts` | `components/joins.ts` | **Join**: Keep structure, remove `hints` (Flink optimizer). **IntervalJoin, TemporalJoin, LookupJoin**: Keep API, defer runtime implementation to Phase 2. |
| `src/components/windows.ts` | `components/windows.ts` | **TumbleWindow, SlideWindow, SessionWindow**: ~95% reuse. Duration format stays the same. Implementation in Go runtime is Phase 2. |
| `src/components/catalogs.ts` | — | **Not ported.** Catalogs are a Flink concept. Isotope uses direct connector configuration. |
| `src/components/escape-hatches.ts` | `components/escape-hatches.ts` | **RawSQL**: Rename to `RawExpr` or keep as `RawSQL` since Isotope uses SQL strings too. Remove **UDF** (Java JARs are Flink-specific). |
| `src/components/cep.ts` | `components/cep.ts` | **MatchRecognize**: Port as-is. Runtime implementation is Arrow-native + Pebble. |
| `src/components/query.ts` | `components/query.ts` | Port `Query.Select`, `Query.Where`, `Query.GroupBy`, `Query.Having`. Remove `Query.OrderBy` window function specifics (Flink TVF syntax). |

**CLI (adapt → `packages/cli/`)**

| FlinkReactor Source | Isotope Target | Changes |
|---------------------|----------------|---------|
| `src/cli/index.ts` | `cli/index.ts` | Rename program `flink-reactor` → `isotope`. Keep Commander.js structure. Replace command registrations with Isotope commands. |
| `src/cli/discovery.ts` | `cli/discovery.ts` | ~90% reuse. Keep `discoverPipelines()`, `loadConfig()`, `loadPipeline()`, `resolveProjectContext()`. Change jiti `importSource` from `'flink-reactor'` to `'@isotope/dsl'`. |
| `src/cli/commands/synth.ts` | `cli/commands/synth.ts` | Replace SQL+CRD output with Protobuf `.pb` file output. Keep pipeline discovery, per-pipeline synthesis loop. |
| `src/cli/commands/new.ts` | `cli/commands/new.ts` | Replace Flink templates with Isotope templates (Generator→Console, Kafka→Filter→Map→Kafka). Keep scaffolding logic. |
| `src/cli/commands/dev.ts` | `cli/commands/dev.ts` | Replace Flink cluster management with Docker Compose (Kafka KRaft + Go runtime). Keep file watcher, re-synth on change. |
| `src/cli/commands/graph.ts` | `cli/commands/inspect.ts` | Merge graph visualization with plan inspection. Add `--json` output. |

**Not Ported (Flink-specific, replaced by new Isotope code)**

| FlinkReactor Source | Why Not Ported | Isotope Replacement |
|---------------------|---------------|---------------------|
| `src/codegen/sql-generator.ts` | Generates Flink SQL — Isotope targets Protobuf | `compiler/plan-compiler.ts` (new) |
| `src/codegen/crd-generator.ts` | Generates FlinkDeployment K8s CRD | Not needed until Phase 6 (Isotope K8s operator) |
| `src/codegen/schema-introspect.ts` | Resolves schemas for Flink SQL column types | `compiler/schema-resolver.ts` (new, Arrow types) |
| `src/codegen/connector-resolver.ts` | Resolves Maven JARs for Flink connectors | Not needed — Go uses modules |
| `src/codegen/connector-registry.ts` | Maven artifact database | Not needed |
| `src/core/flink-compat.ts` | Flink version compatibility (1.20→2.2) | Not needed |
| `packages/create-fr-app/` | npm scaffolding wrapper | Replaced by `isotope new` in CLI |
| `packages/ts-plugin/` | TypeScript IDE plugin for Flink SQL | Future: TS plugin for Isotope expressions |
| `packages/ui/` | Dashboard React components | Future: Isotope dashboard |
| `apps/dashboard/` | Flink cluster management UI | Future: Isotope dashboard |

#### Port Order

The port follows dependency order — each layer depends on the previous:

```
1. Core types (types.ts)                    ← no dependencies
2. Schema system (schema.ts, Field)         ← depends on types
3. JSX runtime (jsx-runtime.ts)             ← depends on types
4. Tree utilities (tree-utils.ts)           ← depends on types
5. SynthContext (synth-context.ts)          ← depends on types, tree-utils
6. Plugin system (plugin.ts, registry)      ← depends on types, synth-context
7. Config/Environment (config.ts, env.ts)   ← depends on types
8. Components (all)                         ← depends on types, schema, jsx-runtime
9. App synthesis (app.ts)                   ← depends on everything above
10. CLI discovery + commands                ← depends on app synthesis
```

Steps 1–9 form the `packages/dsl/` package. Step 10 is `packages/cli/`.

#### Adaptation Principles

1. **Type system pivot**: `FlinkType` (string-based: `"BIGINT"`, `"VARCHAR(255)"`) → `ArrowType` (enum-based: `ARROW_INT64`, `ARROW_STRING`). The `Field` builder API stays the same (`Field.BIGINT()`) but maps to Arrow types internally.
2. **Remove changelog mode**: FlinkReactor tracks CDC changelog semantics (append-only/retract/upsert). Isotope Phase 1 is append-only. The `ChangelogMode` concept stays in the Protobuf schema for future phases but is always `APPEND_ONLY` initially.
3. **SQL strings pass through**: Both FlinkReactor and Isotope use raw SQL strings for expressions. FlinkReactor passes them to Flink SQL verbatim; Isotope passes them to the Go runtime where vitess/sqlparser evaluates them. The TSX API is identical — `<Filter condition="amount > 100" />` works in both.
4. **Compilation target changes**: FlinkReactor's `synthesizeApp()` → SQL + CRD. Isotope's `synthesizeApp()` → Protobuf ExecutionPlan. The ConstructNode tree (intermediate representation) is the same.

---

## 3. Language Architecture: TypeScript + Go

```
┌─────────────────────────────────────────────────────────┐
│                    USER-FACING LAYER                     │
│                                                         │
│  TypeScript/JSX DSL → Pipeline definition                │
│  TypeScript CLI     → Developer workflow                 │
│  TypeScript/React   → Documentation site (fumadocs)      │
│  TypeScript         → Testing helpers                    │
└──────────────────────────┬──────────────────────────────┘
                           │ Protobuf ExecutionPlan
                           ▼
┌─────────────────────────────────────────────────────────┐
│                    RUNTIME LAYER (Go)                    │
│                                                         │
│  Execution Engine → goroutine pools + channels           │
│  Data Model       → Apache Arrow RecordBatches           │
│  State Backend    → Pebble (pure-Go LSM)                 │
│  Checkpointing   → Chandy-Lamport barriers + etcd        │
│  Shuffle          → Arrow Flight (inter-node)             │
│  Backpressure    → Credit-based flow control              │
│  Connectors      → Kafka (franz-go), JDBC, Parquet       │
└─────────────────────────────────────────────────────────┘
```

### What Could Go Wrong: Two Languages

| Risk | Likelihood | Learning Impact | Mitigation |
|------|------------|-----------------|------------|
| **Debugging across the boundary** — Runtime errors in Go reference `operator_id: "filter_0"`, not the TSX source line. | Very High | Medium — teaches you about source maps and debug info propagation | Embed TSX source locations in the Protobuf plan from day one. |
| **Protobuf TS codegen fragmentation** — `protobuf-ts`, `ts-proto`, `protobufjs`, `@bufbuild/protobuf` all have trade-offs. | Medium | Low | Use `@bufbuild/protobuf` (Buf ecosystem). Document the comparison as a chapter. |
| **Build pipeline complexity** — pnpm + Go modules + protoc + Docker. | High | Medium — teaches polyglot build systems | Provide a `devcontainer.json`. Document the build architecture. |

---

## 4. Protobuf Execution Plan

The execution plan is the contract between TypeScript and Go. It fully describes a pipeline's operators, wiring, schemas, and configuration.

```protobuf
syntax = "proto3";
package isotope.v1;

import "google/protobuf/duration.proto";

// ─── Top-Level Plan ─────────────────────────────────────

message ExecutionPlan {
  string pipeline_name = 1;
  int32 default_parallelism = 2;
  PipelineMode mode = 3;
  CheckpointConfig checkpoint = 4;
  StateConfig state = 5;
  RestartConfig restart = 6;
  map<string, string> extra_config = 7;
  repeated OperatorNode operators = 10;
  repeated Edge edges = 11;
}

enum PipelineMode { STREAMING = 0; BATCH = 1; }

message CheckpointConfig {
  google.protobuf.Duration interval = 1;
  google.protobuf.Duration min_pause = 2;
  google.protobuf.Duration timeout = 3;
  CheckpointMode mode = 4;
}

enum CheckpointMode { AT_LEAST_ONCE = 0; EXACTLY_ONCE = 1; }
message StateConfig { StateBackend backend = 1; google.protobuf.Duration ttl = 2; }
enum StateBackend { PEBBLE = 0; MEMORY = 1; }

// ─── Schema ─────────────────────────────────────────────

message Schema {
  repeated SchemaField fields = 1;
  WatermarkConfig watermark = 2;
  repeated string primary_key = 3;
}

message SchemaField {
  string name = 1;
  string flink_type = 2;      // "BIGINT", "STRING", "TIMESTAMP(3)"
  ArrowType arrow_type = 3;
  bool nullable = 4;
}

enum ArrowType {
  ARROW_INT64 = 0; ARROW_INT32 = 1; ARROW_FLOAT64 = 2; ARROW_FLOAT32 = 3;
  ARROW_STRING = 4; ARROW_BINARY = 5; ARROW_BOOLEAN = 6;
  ARROW_TIMESTAMP_MS = 7; ARROW_TIMESTAMP_US = 8; ARROW_DATE32 = 9;
  ARROW_DECIMAL128 = 10; ARROW_LIST = 11; ARROW_MAP = 12; ARROW_STRUCT = 13;
}

message WatermarkConfig {
  string column = 1;
  google.protobuf.Duration max_delay = 2;
}

// ─── Operators ──────────────────────────────────────────

message OperatorNode {
  string id = 1;
  OperatorType type = 2;
  int32 parallelism = 3;
  Schema input_schema = 5;
  Schema output_schema = 6;
  ChangelogMode changelog_mode = 7;
  SourceLocation source_location = 8;  // TSX file:line for debugging
  ExecutionStrategy execution_strategy = 9;  // How the Go runtime executes this operator

  oneof config {
    KafkaSourceConfig kafka_source = 10;
    JdbcSourceConfig jdbc_source = 11;
    FileSourceConfig file_source = 12;
    GeneratorSourceConfig generator_source = 13;
    KafkaSinkConfig kafka_sink = 20;
    JdbcSinkConfig jdbc_sink = 21;
    FileSinkConfig file_sink = 22;
    IcebergSinkConfig iceberg_sink = 23;
    ConsoleSinkConfig console_sink = 24;
    FilterConfig filter = 30;
    MapConfig map = 31;
    FlatMapConfig flat_map = 32;
    AggregateConfig aggregate = 33;
    DeduplicateConfig deduplicate = 34;
    TopNConfig top_n = 35;
    UnionConfig union = 36;
    HashJoinConfig hash_join = 50;
    IntervalJoinConfig interval_join = 51;
    LookupJoinConfig lookup_join = 52;
    TemporalJoinConfig temporal_join = 53;
    TumbleWindowConfig tumble_window = 60;
    SlideWindowConfig slide_window = 61;
    SessionWindowConfig session_window = 62;
    RouteConfig route = 70;
    RawSqlConfig raw_sql = 80;
    MatchRecognizeConfig match_recognize = 90;
  }
}

enum OperatorType { SOURCE = 0; SINK = 1; TRANSFORM = 2; JOIN = 3; WINDOW = 4; ROUTE = 5; CEP = 6; }
enum ExecutionStrategy { ARROW_NATIVE = 0; DUCKDB_MICRO_BATCH = 1; }
enum ChangelogMode { APPEND_ONLY = 0; RETRACT = 1; UPSERT = 2; }
message SourceLocation { string file = 1; int32 line = 2; int32 column = 3; }

// ─── Edges ──────────────────────────────────────────────

message Edge {
  string from_operator = 1;
  string to_operator = 2;
  ShuffleStrategy shuffle = 3;
  repeated string partition_keys = 4;
}

enum ShuffleStrategy { FORWARD = 0; HASH = 1; BROADCAST = 2; ROUND_ROBIN = 3; RANGE = 4; }

// ─── Operator Configs (abbreviated — see full schema in proto/) ──

message KafkaSourceConfig {
  string topic = 1; string bootstrap_servers = 2; string format = 3;
  string consumer_group = 4; string startup_mode = 5;
  map<string, string> properties = 7;
}
message KafkaSinkConfig {
  string topic = 1; string bootstrap_servers = 2; string format = 3;
  string key_by = 4; map<string, string> properties = 5;
}
message JdbcSourceConfig { string url = 1; string table = 2; string username = 3; string password_env = 4; }
message JdbcSinkConfig { string url = 1; string table = 2; bool upsert_mode = 5; repeated string key_fields = 6; }
message FileSourceConfig { string path = 1; string format = 2; }
message FileSinkConfig { string path = 1; string format = 2; repeated string partition_by = 3; }
message IcebergSinkConfig { string catalog_name = 1; string database = 2; string table = 3; repeated string upsert_key = 4; }
message GeneratorSourceConfig { int64 rows_per_second = 1; int64 max_rows = 2; }
message ConsoleSinkConfig { int32 max_rows = 1; }

// Transforms use raw SQL strings — parsed by Go runtime via vitess/sqlparser.
// This avoids the structured Expression proto trap (see "What Could Go Wrong" below).
message FilterConfig { string condition_sql = 1; }
message MapConfig { repeated ColumnMapping columns = 1; }
message ColumnMapping { string output_name = 1; string expression_sql = 2; }
message FlatMapConfig { string unnest_field = 1; }
message AggregateConfig { repeated string group_by = 1; repeated AggColumn aggregations = 2; }
message AggColumn { string output_name = 1; string expression_sql = 2; }
message DeduplicateConfig { repeated string key_fields = 1; string order_by = 2; bool keep_last = 3; google.protobuf.Duration within = 4; }
message TopNConfig { repeated string partition_by = 1; string order_by = 2; bool ascending = 3; int32 n = 4; }
message UnionConfig {}

// Joins
message HashJoinConfig { JoinType type = 1; string condition_sql = 2; BroadcastHint broadcast = 3; }
enum JoinType { INNER = 0; LEFT = 1; RIGHT = 2; FULL = 3; ANTI = 4; SEMI = 5; }
enum BroadcastHint { NO_BROADCAST = 0; BROADCAST_LEFT = 1; BROADCAST_RIGHT = 2; }
message IntervalJoinConfig { string condition_sql = 1; google.protobuf.Duration lower_bound = 2; google.protobuf.Duration upper_bound = 3; }
message LookupJoinConfig { JdbcSourceConfig table = 1; string condition_sql = 2; bool async = 3; int32 async_capacity = 4; }
message TemporalJoinConfig { string condition_sql = 1; string time_column = 2; }

// Windows
message TumbleWindowConfig { string time_column = 1; google.protobuf.Duration size = 2; }
message SlideWindowConfig { string time_column = 1; google.protobuf.Duration size = 2; google.protobuf.Duration slide = 3; }
message SessionWindowConfig { string time_column = 1; google.protobuf.Duration gap = 2; }

// Route
message RouteConfig { repeated RouteBranch branches = 1; bool has_default = 2; }
message RouteBranch { string name = 1; string condition_sql = 2; }

// Escape hatches
message RawSqlConfig { string sql = 1; }

// CEP
message MatchRecognizeConfig {
  repeated string partition_by = 1; string order_by = 2; string pattern = 3;
  map<string, string> define = 4; repeated ColumnMapping measures = 5; string after_match = 6;
}
```

**Key design decision**: All expressions use `string` (`condition_sql`, `expression_sql`) instead of a structured `Expression` protobuf. The Go runtime parses these via vitess/sqlparser. This avoids the "Expression proto trap" where you build an incomplete expression tree that can't handle real SQL, and end up needing a SQL parser anyway.

### What Could Go Wrong: The Protobuf Contract

| Risk | Likelihood | Learning Impact | Mitigation |
|------|------------|-----------------|------------|
| **SQL string expressions delay type-checking to runtime** — With raw SQL strings, the TypeScript compiler can't validate that `amount > 100` refers to a real column. Errors surface only when the Go runtime parses the plan. | High | High — teaches the tradeoffs of early vs late binding | Add a TypeScript validation pass in the plan-compiler that parses SQL strings and checks column references against schemas. Document as a chapter on type systems and validation strategies. |
| **vitess/sqlparser doesn't support all Flink SQL syntax** — TUMBLE(), HOP(), SESSION() are Flink-specific extensions not in MySQL syntax. | High | Medium | Fork or extend the parser for streaming-specific syntax. Document as a chapter on parser extension and grammar modification. |
| **Protobuf schema churn** — Adding new operator types or config fields requires coordinated TS + Go changes. | Medium | Low | Use `map<string, string>` for operator-specific extensions. Reserve field numbers. |

---

## 5. Go Runtime Architecture

### 5.1 Arrow-Native Data Model

All data flows as Apache Arrow RecordBatches — columnar, not row-by-row:

```
┌───────────────────────────────────────────────┐
│              Arrow RecordBatch                 │
│                                               │
│  Schema: {user_id: Int64, event: Utf8, ts: Timestamp}
│                                               │
│  Column 0 (user_id): [101, 102, 103, ...]     │  ← contiguous memory
│  Column 1 (event):   ["click","view",...]     │  ← contiguous memory
│  Column 2 (ts):      [1706000, 1706001, ...]  │  ← contiguous memory
│                                               │
│  Batch size: 1024-8192 rows (configurable)     │
└───────────────────────────────────────────────┘
```

### 5.2 Operator Interface

```go
type Operator interface {
    Open(ctx *OperatorContext) error
    ProcessBatch(batch arrow.Record) ([]arrow.Record, error)
    ProcessWatermark(wm Watermark) error
    ProcessCheckpointBarrier(barrier CheckpointBarrier) error
    Close() error
}

type StatefulOperator interface {
    Operator
    InitializeState(backend StateBackend) error
    SnapshotState() ([]byte, error)
    RestoreState(snapshot []byte) error
}
```

### 5.3 Execution Graph

```
Protobuf ExecutionPlan           Go Runtime
──────────────────────           ──────────

operators + edges        →       Load plan → validate schemas
                                      │
                                 Build LogicalPlan (DAG)
                                      │
                                 Optimizer (predicate pushdown, projection pruning,
                                      │   operator fusion)
                                      │
                                 PhysicalPlan (parallelism, partitioning)
                                      │
                                 ExecutionGraph (task slots, channel wiring)
                                      │
                                 TaskManager.deploy(graph)
                                      │
                                 goroutines + channels (intra-node)
                                 Arrow Flight (inter-node)
```

### 5.4 State Backend (Pebble)

```
┌──────────────────────────────────────────┐
│            StateBackend Interface          │
│                                          │
│  ValueState[T]  — single value per key    │
│  ListState[T]   — append-only list        │
│  MapState[K,V]  — nested key-value        │
│  ReducingState[T] — pre-aggregate         │
│  WindowState    — per-window + per-key    │
└──────────────────┬───────────────────────┘
                   │
       ┌───────────┼───────────┐
       ▼           ▼           ▼
   ┌────────┐ ┌────────┐ ┌──────────┐
   │ Pebble │ │ Memory │ │ RocksDB  │
   │ (dflt) │ │ (test) │ │ (compat) │
   └────────┘ └────────┘ └──────────┘
```

Key encoding: `[operator_id | key_group | state_name | user_key]`

### 5.5 Checkpointing (Chandy-Lamport Barriers)

```
Phase 1: Trigger        — JobManager injects barrier into all sources
Phase 2: Propagation    — Operators snapshot state on barrier, forward downstream
Phase 3: Acknowledge    — Sinks pre-commit, all tasks ack to JobManager
Phase 4: Commit         — JobManager marks complete, sinks commit
Recovery:               — Restore latest checkpoint, resume from offsets
```

### 5.6 Credit-Based Backpressure

```
Upstream Task                    Downstream Task

  has records    ← credits=5 ──  "I can accept 5 batches"
  send batch 1  ─────────────→  receive, process, return credit
  credits: 0    ← (stall) ────  (still processing...)
  RESUME ▶️     ← credit=2 ──  "done, accept 2 more"
```

### 5.7 Windowing

```
Window Assigner (Tumble/Slide/Session)
  → assigns record to window(s)
Window State (Pebble: [op | key_group | window | key] → accumulator)
  → watermark passes window end
Trigger (EventTime / Count / ProcessingTime)
  → emits window result
Evictor (cleanup expired state, handle late data)
```

### 5.8 Dual Execution Strategy: Arrow-Native vs DuckDB Micro-Batch

Not every operator needs a custom Go implementation. For operations that run SQL-like logic on a **bounded set of records** — GROUP BY aggregations within a window, TopN ranking, hash joins within a window, or user-written SQL — an isolated in-memory DuckDB instance provides a production-grade SQL engine with zero-copy Arrow integration, a query optimizer, hash joins, hash aggregates, and window functions. No need to reimplement these from scratch.

This gives Isotope two execution paths, chosen **at compile time** by the plan-compiler:

```
Arrow RecordBatch arrives
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌──────────────────────┐
│ Arrow  │ │ DuckDB Micro-Batch   │
│ Native │ │                      │
│        │ │ Per-operator isolated │
│Filter  │ │ in-memory DuckDB     │
│Map     │ │ instance (`:memory:`)│
│FlatMap │ │                      │
│Union   │ │ Window + Aggregate   │
│Route   │ │ TopN                 │
│Cast    │ │ HashJoin (windowed)  │
│Rename  │ │ RawSQL               │
│Drop    │ │                      │
│        │ │ Zero-copy bridge:    │
│Interval│ │ RegisterView(Arrow)  │
│ Join   │ │ → SQL execution      │
│Temporal│ │ → QueryContext(Arrow) │
│ Join   │ │                      │
│Lookup  │ │ duckdb/duckdb-go     │
│ Join   │ │ (official Go binding) │
│Dedup   │ │                      │
│CEP     │ │                      │
│        │ │                      │
│ Arrow  │ │ Collect micro-batch  │
│ compute│ │ → Load via Arrow     │
│ kernels│ │ → Execute SQL        │
│+Pebble │ │ → Read Arrow result  │
└───┬────┘ └────────┬─────────────┘
    └───────┬───────┘
            ▼
   Arrow RecordBatch out
```

#### Decision Logic

The TypeScript plan-compiler sets `execution_strategy` on each operator in the Protobuf plan:

| Condition | Strategy | Rationale |
|-----------|----------|-----------|
| Stateless operator (Filter, Map, FlatMap, Union, Route, Rename, Drop, Cast) | **Arrow-Native** | Per-batch Arrow compute kernels are faster than SQL round-trip overhead. No state needed. |
| Operator **inside a Window** performing GROUP BY / aggregate | **DuckDB Micro-Batch** | Window boundary = natural micro-batch boundary. DuckDB runs `SELECT ... GROUP BY ...` on the window's accumulated records. |
| TopN (ORDER BY + LIMIT) | **DuckDB Micro-Batch** | DuckDB has optimized Top-K execution. Equivalent to `ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...) QUALIFY rn <= N`. |
| RawSQL | **DuckDB Micro-Batch** | User wrote SQL — execute it literally in DuckDB. |
| HashJoin where both inputs are bounded by the same window | **DuckDB Micro-Batch** | Load both sides into DuckDB, run JOIN. DuckDB's hash join is production-grade. |
| Continuous time-bounded operation (IntervalJoin, TemporalJoin) | **Arrow-Native + Pebble** | Records arrive asynchronously on both sides. No natural batch boundary — each record triggers state lookup. Pebble manages the time-indexed state. |
| Per-record key tracking (Deduplicate) | **Arrow-Native + Pebble** | Each incoming record checks/updates per-key state. `within` defines TTL, not a computation boundary. |
| LookupJoin | **Arrow-Native** | External I/O to a database, not a computation. Async pgx with LRU cache. |
| MatchRecognize (CEP) | **Arrow-Native + Pebble** | Pattern matching is sequential per-key. DuckDB doesn't support MATCH_RECOGNIZE. |

#### DuckDB Micro-Batch Lifecycle (Windowed)

```
Records arrive continuously
         │
         ▼
┌─────────────────────────┐
│    Window Assigner       │  Route each record to its window(s)
│    (Tumble/Slide/Session)│  Buffer in per-window Arrow RecordBatch accumulator
└────────────┬────────────┘
             │
   Watermark passes window.end
             │
             ▼
┌─────────────────────────────────────────────────────────┐
│  DuckDB Micro-Batch Execution                           │
│                                                         │
│  1. arrow.RegisterView(windowBuffer, "input")           │ ← zero-copy
│  2. duckdb.QueryContext(ctx, `                           │
│       SELECT product_id, SUM(amount), COUNT(*)          │
│       FROM input GROUP BY product_id                    │
│     `)                                                  │
│  3. Read result as arrow.RecordReader                   │ ← zero-copy
│  4. Emit downstream                                     │
│  5. Release view + buffer                               │
└─────────────────────────────────────────────────────────┘
```

For **non-windowed** aggregations (global running count, etc.), the micro-batch boundary is a configurable time interval (e.g., every 1 second). Each micro-batch computes partial aggregates in DuckDB, which are then merged with the running state in Pebble.

#### Why Two Strategies Instead of One

**Why not DuckDB for everything:**
- **Latency**: DuckDB query compilation adds 0.5–2ms overhead per micro-batch. For stateless operators at millions of records/sec, this is unacceptable.
- **Continuous state**: IntervalJoin and TemporalJoin require per-record state across time boundaries. Loading/unloading DuckDB tables per record defeats the purpose.
- **CGO**: DuckDB via `duckdb/duckdb-go` uses CGO (~30MB binary size increase, cross-compilation complexity).
- **GC invisibility**: DuckDB's C allocator is invisible to Go's GC. Large micro-batches can OOM without Go's runtime noticing.

**Why not Arrow-native for everything:**
- **Implementation effort**: A correct hash aggregate, hash join, sort, and window function implementation in Go is months of work.
- **Correctness for free**: DuckDB's SQL engine is thoroughly tested. Every custom implementation introduces bugs.
- **Debuggability**: When a windowed aggregation produces wrong results, you can inspect the micro-batch SQL, run `EXPLAIN`, and examine the input data. This is far easier than debugging custom Arrow compute chains.
- **Expression completeness**: DuckDB supports ~500 functions vs ~40 Arrow Go compute kernels. No need to implement `PERCENTILE_CONT`, `REGEXP_REPLACE`, `DATE_TRUNC`, `ARRAY_AGG` yourself.

#### What Could Go Wrong: DuckDB Integration

| Risk | Likelihood | Learning Impact | Mitigation |
|------|------------|-----------------|------------|
| **CGO complicates the build** — Cross-compilation requires matching C toolchains. CI matrix explodes. | High | Medium — teaches CGO build systems | Use pre-built DuckDB static libraries. Document the build matrix. Make DuckDB optional via build tags (`//go:build duckdb`). |
| **Memory accounting across C/Go boundary** — DuckDB allocates memory via `malloc`, invisible to Go's GC and `GOMEMLIMIT`. A large micro-batch in DuckDB can OOM the process. | High | **High** — teaches memory isolation in mixed-language runtimes | Set DuckDB's `memory_limit` per instance. Track DuckDB memory usage in the Go memory accounting system. Document as chapter content. |
| **Micro-batch size tuning** — Too small: DuckDB query compilation overhead dominates. Too large: latency increases, memory spikes. | Very High | **Good** — teaches the latency-throughput tradeoff from a different angle than Arrow batch sizes | Benchmark across micro-batch sizes (100, 1K, 10K, 100K records). Document the sweet spot in `foundations/duckdb-micro-batch` chapter. |
| **DuckDB crash = Go process crash** — A DuckDB bug (rare) causes SIGSEGV, killing the entire Go runtime. | Low | Medium | Isolate DuckDB in separate goroutine with panic recovery. Accept the risk — DuckDB is well-tested. |
| **Two code paths = double testing surface** — Every stateful operator needs tests for both Arrow-native and DuckDB paths (where applicable). | High | **Good** — forces you to build a conformance test suite comparing both paths. Document as testing methodology. |

---

### What Could Go Wrong: Go Runtime Internals

| Risk | Likelihood | Learning Impact | Mitigation |
|------|------------|-----------------|------------|
| **Arrow Go memory leaks** — `Retain()`/`Release()` reference counting is error-prone. A single missed `Release()` causes unbounded memory growth. | Very High | **Excellent** — forces deep understanding of manual memory management in a GC'd language | Write a `RecordBatch` wrapper with `defer batch.Release()` patterns. Build a leak detector for tests. Document as a chapter on memory management strategies. |
| **Arrow Go compute is incomplete** — Fewer kernels than C++/Rust Arrow. No native hash group-by, limited string functions. | Very High | **Excellent** — forces you to implement compute kernels from scratch | Implement missing kernels yourself. Each kernel is a self-contained learning exercise. Document as chapters on vectorized execution. |
| **Pebble single-writer bottleneck** — All state writes serialize through one write path. | Medium | **High** — teaches LSM tree write path internals | Shard Pebble instances per key-group range. Document as a chapter on write amplification and LSM tree compaction. |
| **Checkpoint barrier alignment causes backpressure amplification** — Multi-input operators buffer records while waiting for all barriers. Under skew, this consumes gigabytes. | High | **Excellent** — this is Flink's #1 production issue, understanding it deeply is rare expertise | Implement unaligned checkpoints as a follow-up. Document as a chapter comparing aligned vs unaligned checkpointing. |
| **Diamond DAG deadlocks with credit-based backpressure** — A fans out to B and C, both fan into D. Credit exhaustion in one path blocks the other. | Medium | **Excellent** — teaches flow control theory and deadlock prevention | Implement cycle detection at graph construction. Document as a chapter on flow control algorithms. |
| **Exactly-once with Kafka 2PC has zero Go reference implementations** — You're building from papers. | High (for E2E) | **Exceptional** — very few engineers have implemented this | Start with at-least-once. Add exactly-once as a dedicated learning phase. Document as a chapter on exactly-once semantics and two-phase commit. |

---

## 6. Project Structure

```
isotope/
├── proto/                          # Protobuf definitions (shared contract)
│   └── isotope/v1/
│       ├── plan.proto
│       ├── schema.proto
│       ├── operators.proto
│       └── runtime.proto
│
├── packages/
│   ├── dsl/                        # TypeScript DSL (ported from FlinkReactor)
│   │   ├── src/
│   │   │   ├── core/               # types, jsx-runtime, schema, synth-context
│   │   │   ├── components/         # All TSX components
│   │   │   ├── compiler/           # plan-compiler, schema-resolver, shuffle-planner
│   │   │   └── testing/            # synth(), validate() helpers
│   │   └── package.json
│   │
│   └── cli/                        # TypeScript CLI
│       ├── src/commands/           # new, synth, dev, deploy, inspect
│       └── package.json
│
├── runtime/                        # Go streaming runtime
│   ├── cmd/
│   │   └── isotope-runtime/    # Main binary
│   ├── pkg/
│   │   ├── plan/                   # Protobuf plan loader + validator
│   │   ├── engine/                 # Execution engine, task manager, backpressure
│   │   ├── operator/               # Built-in operators (filter, map, aggregate, join, etc.)
│   │   ├── window/                 # Tumble, Slide, Session assigners + triggers
│   │   ├── expression/             # SQL expression → Arrow compute (vitess/sqlparser)
│   │   ├── state/                  # Pebble backend, key-group encoding
│   │   ├── checkpoint/             # Chandy-Lamport coordinator, barriers, snapshots
│   │   ├── watermark/              # Generator, tracker, clock
│   │   ├── duckdb/                 # DuckDB micro-batch execution
│   │   │   ├── instance.go         # Isolated DuckDB instance lifecycle
│   │   │   ├── arrow_bridge.go     # Arrow ↔ DuckDB zero-copy (RegisterView/QueryContext)
│   │   │   ├── micro_batch.go      # Micro-batch operator base (collect → execute → emit)
│   │   │   └── window_executor.go  # Window-aware DuckDB execution (fires on watermark)
│   │   ├── connector/              # kafka/, jdbc/, file/, iceberg/, console/
│   │   ├── shuffle/                # Channels (intra-node), Arrow Flight (inter-node)
│   │   ├── sql/                    # vitess/sqlparser, planner, optimizer
│   │   └── cluster/                # Job manager, task manager, service discovery
│   ├── internal/proto/             # Generated Go code from .proto
│   └── go.mod
│
├── operator/                       # K8s Operator (Go, Operator SDK)
│   ├── api/v1alpha1/               # CRD types
│   └── controllers/                # Pipeline, scaling, checkpoint controllers
│
├── web/                            # Course documentation site
│   ├── app/                        # TanStack Start app
│   ├── content/docs/               # Fumadocs MDX content (the course)
│   │   ├── getting-started/
│   │   ├── foundations/            # Phase 1 chapters
│   │   ├── state-and-time/         # Phase 2 chapters
│   │   ├── fault-tolerance/        # Phase 3 chapters
│   │   ├── distribution/           # Phase 4 chapters
│   │   ├── sql-and-optimization/   # Phase 5 chapters
│   │   ├── production/             # Phase 6 chapters
│   │   └── reference/              # API reference, proto schema, CLI
│   └── package.json
│
├── examples/                       # Example pipelines
├── docker/                         # Runtime + dev Dockerfiles
│   ├── runtime.Dockerfile
│   ├── dev.docker-compose.yml
│   └── benchmark/                  # Benchmark infrastructure
│       ├── docker-compose.yml      # Kafka (3 brokers) + runtime + Prometheus + Grafana
│       ├── generators/             # YSB, NEXMark, TPC-H data generators
│       ├── dashboards/             # Grafana benchmark dashboard
│       └── scripts/                # run-ysb.sh, run-nexmark.sh, run-tpch.sh
├── pnpm-workspace.yaml
└── CLAUDE.md
```

---

## 7. Course Documentation Site

The documentation site is powered by **fumadocs** on **TanStack Start** (not Next.js). It serves as both project docs and a progressive course on streaming systems.

### Site Structure

```
web/content/docs/
├── getting-started/
│   ├── index.mdx                   # What is Isotope
│   ├── installation.mdx            # Setup: Go, Node, protoc, Docker
│   ├── first-pipeline.mdx          # Hello world: Generator → Console
│   └── project-structure.mdx       # Monorepo tour
│
├── foundations/                     # ── Phase 1 ──
│   ├── index.mdx                   # "How does data flow through a stream processor?"
│   ├── goroutines-and-channels.mdx # Go's concurrency model for streaming
│   ├── arrow-columnar-model.mdx    # Why columnar > row-based for throughput
│   ├── arrow-memory-management.mdx # Retain/Release, allocators, zero-copy
│   ├── protobuf-as-contract.mdx    # IDL design, code generation, versioning
│   ├── operator-model.mdx          # The Operator interface and operator chaining
│   ├── kafka-consumer-internals.mdx # Consumer groups, offsets, rebalancing
│   ├── expression-evaluation.mdx   # SQL parsing → Arrow compute kernel dispatch
│   ├── batch-size-tuning.mdx       # Latency vs throughput tradeoff
│   ├── benchmarking-streaming-systems.mdx # YSB, NEXMark, metrics, Coordinated Omission
│   └── duckdb-micro-batch.mdx     # DuckDB as embedded SQL engine, Arrow bridge, micro-batch tuning
│
├── state-and-time/                 # ── Phase 2 ──
│   ├── index.mdx                   # "How does a stream processor remember?"
│   ├── event-time-vs-processing.mdx # The two clocks problem
│   ├── watermarks.mdx              # Theory, generation, propagation, tracking
│   ├── lsm-trees.mdx              # How Pebble works: memtable, SSTs, compaction
│   ├── keyed-state.mdx            # ValueState, ListState, MapState internals
│   ├── key-group-encoding.mdx     # How state enables rescaling
│   ├── tumble-windows.mdx         # Fixed windows: assignment, accumulation, trigger
│   ├── slide-windows.mdx          # Overlapping windows and multi-assignment
│   ├── session-windows.mdx        # Dynamic gap-based windows and merge logic
│   ├── late-data.mdx              # Allowed lateness, side outputs, retractions
│   ├── hash-joins.mdx             # Build/probe, memory management, spill-to-disk
│   ├── interval-joins.mdx         # Time-bounded joins with state cleanup
│   ├── temporal-joins.mdx         # Versioned state for point-in-time lookups
│   ├── lookup-joins.mdx           # Async I/O, caching strategies, cache invalidation
│   └── nexmark-benchmark.mdx     # NEXMark q0-q8 results, correctness, profiling
│
├── fault-tolerance/                # ── Phase 3 ──
│   ├── index.mdx                   # "How does a stream processor survive failure?"
│   ├── chandy-lamport.mdx         # The original paper, algorithm walkthrough
│   ├── barrier-alignment.mdx      # How Flink adapted Chandy-Lamport for streaming
│   ├── unaligned-checkpoints.mdx  # The alternative: buffer barriers in-flight
│   ├── state-snapshots.mdx        # Pebble checkpoint mechanics, incremental snapshots
│   ├── exactly-once-semantics.mdx # What it means, what it doesn't, common misconceptions
│   ├── two-phase-commit.mdx       # Kafka transactions, JDBC transactions, coordinator
│   ├── idempotent-sinks.mdx       # Upsert semantics as a simpler exactly-once
│   ├── recovery-protocol.mdx      # Checkpoint selection, state restore, offset reset
│   └── failure-modes.mdx          # Network partitions, slow nodes, split-brain, data corruption
│
├── distribution/                   # ── Phase 4 ──
│   ├── index.mdx                   # "How does a stream processor scale?"
│   ├── shuffle-and-partitioning.mdx # Hash, broadcast, round-robin, range partitioning
│   ├── arrow-flight.mdx           # Zero-copy network transfer, IPC format
│   ├── grpc-streaming.mdx         # HTTP/2 multiplexing, flow control, keepalives
│   ├── credit-based-flow.mdx      # Backpressure theory, credit protocol, deadlock prevention
│   ├── consistent-hashing.mdx     # Key-group assignment, virtual nodes, rescaling
│   ├── job-manager.mdx            # Centralized coordinator: scheduling, checkpoint triggering
│   ├── task-manager.mdx           # Worker nodes: slot management, resource isolation
│   ├── service-discovery.mdx      # etcd, K8s headless services, heartbeats
│   └── rescaling.mdx              # Savepoint → redistribute key groups → resume
│
├── sql-and-optimization/           # ── Phase 5 ──
│   ├── index.mdx                   # "How does a stream processor compile queries?"
│   ├── sql-parsing.mdx            # vitess/sqlparser internals, AST representation
│   ├── logical-plan.mdx           # Relational algebra: Scan, Filter, Project, Aggregate, Join
│   ├── physical-plan.mdx          # Parallelism decisions, shuffle insertion
│   ├── predicate-pushdown.mdx     # Moving filters closer to sources
│   ├── projection-pruning.mdx     # Eliminating unused columns early
│   ├── operator-fusion.mdx        # Chaining adjacent operators in one goroutine
│   ├── vectorized-execution.mdx   # Column-at-a-time processing, SIMD, branch elimination
│   ├── cost-model.mdx            # Estimating cardinality, selectivity, memory
│   └── nexmark-full-and-tpch.mdx # Full NEXMark, TPC-H stream, optimizer impact
│
├── production/                     # ── Phase 6 ──
│   ├── index.mdx                   # "How does a stream processor run in the wild?"
│   ├── kubernetes-operator.mdx    # The Operator pattern, CRDs, reconciliation loops
│   ├── crd-design.mdx            # IsotopePipeline spec, status, conditions
│   ├── auto-scaling.mdx          # Reactive vs predictive, control theory basics
│   ├── observability.mdx         # Prometheus metrics, structured logging, distributed tracing
│   ├── deployment-strategies.mdx  # Rolling updates, blue-green, canary with savepoints
│   └── security.mdx              # mTLS, RBAC, secrets management, audit logging
│
└── reference/
    ├── proto-schema.mdx           # Full Protobuf schema reference
    ├── cli-commands.mdx           # CLI reference
    ├── operator-catalog.mdx       # All built-in operators with examples
    ├── connector-catalog.mdx      # All connectors with config reference
    └── papers.mdx                 # Annotated bibliography of referenced papers
```

### Key Papers Referenced Throughout

| Paper | Where Referenced | Key Concept |
|-------|-----------------|-------------|
| Chandy & Lamport, 1985 — *Distributed Snapshots* | fault-tolerance/chandy-lamport | The algorithm Isotope implements for checkpointing |
| Akidau et al., 2015 — *The Dataflow Model* | state-and-time/watermarks, windows | Event time, watermarks, windowing semantics |
| Carbone et al., 2015 — *Lightweight Asynchronous Snapshots for Distributed Dataflows* | fault-tolerance/barrier-alignment | How Flink adapted Chandy-Lamport (barrier-based) |
| Carbone et al., 2017 — *State Management in Apache Flink* | state-and-time/keyed-state | Key-group encoding, state backends, incremental checkpoints |
| Abadi et al., 2003 — *Aurora: A New Model for Streams* | distribution/credit-based-flow | Credit-based backpressure origins |
| Graefe, 1994 — *Volcano: An Extensible and Parallel Query Evaluation System* | sql-and-optimization/logical-plan | Iterator model that inspires the Operator interface |
| Kersten et al., 2018 — *Everything You Wanted to Know About Compiled and Vectorized Queries* | sql-and-optimization/vectorized-execution | Column-at-a-time vs tuple-at-a-time |
| O'Neil et al., 1996 — *The Log-Structured Merge-Tree* | state-and-time/lsm-trees | The data structure behind Pebble |
| Raasveldt & Mühleisen, 2019 — *DuckDB: An Embeddable Analytical Database* | foundations/duckdb-micro-batch | Embedded OLAP with vectorized execution, Arrow integration, in-process SQL |
| Tucker et al., 2002 — *NEXMark: A Benchmark for Queries over Data Streams* | foundations/benchmarking-streaming-systems, state-and-time/nexmark-benchmark | The standard streaming benchmark: 3 streams, 22 queries |
| TPC-H Benchmark Specification — *Decision Support Benchmark* | sql-and-optimization/nexmark-full-and-tpch | Adapted for streaming: tables as append-only Kafka topics |

---

## 8. Phased Roadmap

Each phase has: **Learning Objectives**, **What We Build**, **Documentation Chapters**, **What Could Go Wrong**, and a **Checkpoint** that validates readiness to proceed.

---

### Phase 1: Data in Motion (Months 1–3)
*"How does data flow through a stream processor?"*

#### Learning Objectives

By the end of Phase 1, you will deeply understand:
- Go's goroutine scheduler (M:N threading, work-stealing, `GOMAXPROCS`)
- Apache Arrow's columnar memory model (RecordBatch, Array builders, `Retain`/`Release`)
- Protobuf IDL design and cross-language code generation
- Kafka's consumer protocol (consumer groups, partition assignment, offset management)
- The Operator abstraction and operator chaining/fusion
- Expression evaluation: SQL string parsing → vectorized Arrow compute calls
- Latency vs throughput tradeoffs in batch size tuning
- Embedded OLAP engines (DuckDB): CGO integration, Arrow zero-copy bridge, micro-batch tradeoffs

#### What We Build

**Go Runtime Core:**
- Protobuf plan loader and validator (reads `ExecutionStrategy` per operator)
- Execution engine: goroutine pool, buffered channels, operator chaining
- Expression evaluator: vitess/sqlparser → Arrow compute kernel dispatch
- Operators (Arrow-native): Filter, Map, FlatMap, Rename, Drop, Cast, Union
- Connectors: Kafka source/sink (franz-go), Generator source, Console sink
- Basic backpressure: Go channel natural blocking + buffer sizing

**DuckDB Micro-Batch Infrastructure:**
- DuckDB instance manager: create/destroy isolated `:memory:` instances per operator
- Arrow ↔ DuckDB zero-copy bridge (`RegisterView` for Arrow→DuckDB, `QueryContext` for DuckDB→Arrow)
- Micro-batch operator base class: collect records → flush to DuckDB → execute SQL → emit Arrow
- Build tag support: `//go:build duckdb` for optional DuckDB inclusion (Arrow-native fallback without CGO)

**TypeScript DSL:**
- Port core/: types, jsx-runtime, schema, synth-context
- Port components/: all component factories
- New compiler/plan-compiler.ts: ConstructNode → Protobuf
- New compiler/schema-resolver.ts: schema propagation through DAG

**CLI:**
- `isotope new` — scaffold project
- `isotope synth` — compile to Protobuf plan
- `isotope dev` — Docker Compose (Kafka KRaft + Go runtime)
- `isotope inspect` — dump plan, schemas, graph

**Benchmark: Yahoo Streaming Benchmark (YSB)**
- Implement YSB data generator (configurable event rate: 100K–1M events/sec)
- Implement YSB pipeline: Kafka → Filter → KeyBy → TumbleWindow(10s) → Count → Kafka
- Benchmark harness: Prometheus metrics collection, latency histogram, throughput counter
- Reproducible Docker Compose environment (`docker/benchmark/`)
- Baseline measurements: throughput (events/sec), p50/p95/p99 latency, GC pause distribution

#### Documentation Chapters

| Chapter | Key Concepts | Exercises |
|---------|-------------|-----------|
| `foundations/goroutines-and-channels` | M:N scheduling, channel semantics, select, WaitGroups | Build a pipeline of goroutines processing data through channels |
| `foundations/arrow-columnar-model` | Column-major layout, null bitmaps, dictionary encoding | Compare row vs column scan performance on 1M records |
| `foundations/arrow-memory-management` | Reference counting, allocators, pool reuse, leak detection | Intentionally create a leak, detect it, fix it |
| `foundations/protobuf-as-contract` | IDL design, field numbers, wire format, evolution rules | Add a new operator type and generate code for both TS and Go |
| `foundations/operator-model` | Operator interface, Open/Process/Close lifecycle, chaining | Implement a custom operator that uppercases string columns |
| `foundations/kafka-consumer-internals` | Consumer groups, partition assignment, offset commit strategies | Write a consumer that handles rebalancing gracefully |
| `foundations/expression-evaluation` | SQL parsing, AST walking, Arrow kernel dispatch, function registry | Add a custom function (e.g., `REVERSE`) to the evaluator |
| `foundations/batch-size-tuning` | Amortization, GC pressure, cache locality, latency percentiles | Benchmark throughput at batch sizes from 64 to 65536 |
| `foundations/benchmarking-streaming-systems` | YSB design, NEXMark overview, metrics that matter (throughput vs latency vs resource efficiency), how to measure without Coordinated Omission, Prometheus histogram design | Implement the YSB pipeline end-to-end; compare results at 100K, 500K, 1M events/sec; profile where time is spent |
| `foundations/duckdb-micro-batch` | Why embedded SQL engines (DuckDB architecture, vectorized execution, columnar storage), Arrow ↔ DuckDB zero-copy bridge, micro-batch vs per-record tradeoff, when to use DuckDB vs Arrow-native, CGO considerations, memory isolation | Build a micro-batch operator that collects 1000 records, loads into DuckDB, runs `SELECT COUNT(*), AVG(amount) FROM input`, and returns Arrow. Benchmark: at what batch size does DuckDB overhead become negligible? |

#### What Could Go Wrong

| Risk | Likelihood | Impact on Learning |
|------|------------|-------------------|
| **Expression parser yak-shave** — vitess/sqlparser doesn't support Flink-specific syntax. Extending it requires understanding the parser internals deeply. | Very High | **This IS the learning.** Budget 3 weeks for parser work. The chapter on expression evaluation will be one of the most valuable. |
| **Arrow Go API verbosity** — First operator implementations will be 5x more code than expected. | High | **Good** — forces you to build helper utilities. The `arrow-memory-management` chapter comes from this pain. |
| **franz-go Kafka edge cases** — Consumer rebalancing, SASL, schema registry. | High | **Good** — the `kafka-consumer-internals` chapter comes from debugging these. |
| **ConstructNode tree refactoring** — Untangling SQL assumptions takes 2-3 weeks. | Medium | **Mixed** — important for the project but less interesting to document. Keep it focused. |

#### Checkpoint: Phase 1 → Phase 2

Proceed when ALL of the following are true:
- [ ] `isotope dev` runs: Kafka → Filter → Map → Kafka, end-to-end
- [ ] Expression evaluator handles: comparisons, arithmetic, UPPER, COALESCE, CASE WHEN, REGEXP_EXTRACT
- [ ] Memory leak detector catches intentionally leaked RecordBatches in tests
- [ ] **YSB benchmark runs end-to-end** with published results:
  - [ ] ≥100K events/sec sustained throughput (stateless Filter → Map)
  - [ ] p99 latency measured and documented (target: <100ms at 100K events/sec)
  - [ ] Benchmark is reproducible via `docker/benchmark/scripts/run-ysb.sh`
  - [ ] Results published in `foundations/benchmarking-streaming-systems` chapter
- [ ] DuckDB micro-batch infrastructure validated: Arrow→DuckDB→Arrow roundtrip produces correct results
- [ ] All 10 documentation chapters are written with exercises

---

### Phase 2: State & Time (Months 3–6)
*"How does a stream processor remember and reason about time?"*

#### Learning Objectives

By the end of Phase 2, you will deeply understand:
- LSM tree internals (memtable, L0→L6 compaction, bloom filters, block cache)
- Event time vs processing time — why this distinction is fundamental
- Watermark theory: generation, propagation, and the "completeness" guarantee
- Window semantics: tumble, slide, session — assignment, accumulation, triggering, eviction
- Join algorithms for streaming: hash join, interval join, temporal join, lookup join
- Key-group encoding for state partitioning and future rescaling
- The tension between state size and query latency in LSM trees

#### What We Build

**State Backend:**
- Pebble integration with key-group encoding
- `ValueState[T]`, `ListState[T]`, `MapState[K,V]`, `ReducingState[T]`
- State serialization (Go values ↔ bytes) with benchmarks
- Memory-backed state for tests

**Windowing:**
- TumbleWindow, SlideWindow, SessionWindow assigners
- Watermark-driven triggers (EventTimeTrigger)
- Per-window Pebble state with compound key encoding
- Late data handling: allowed lateness, side output
- State eviction after window + lateness expires

**Stateful Operators (DuckDB micro-batch path):**
- Aggregate within window → DuckDB: `SELECT ..., SUM/COUNT/AVG(...) FROM window_batch GROUP BY ...`
- TopN within window → DuckDB: `ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...) QUALIFY rn <= N`
- HashJoin within window → DuckDB: load both sides, run `SELECT ... FROM left JOIN right ON ...`
- Non-windowed aggregate → DuckDB micro-batch (configurable interval) + Pebble partial aggregate merge

**Stateful Operators (Arrow-native + Pebble path):**
- Deduplicate (Pebble ValueState per key — per-record state, no natural batch boundary)
- Route (conditional fan-out — stateless, Arrow-native)

**Joins:**
- HashJoin within window → DuckDB (see above)
- IntervalJoin (time-bounded, Pebble state, watermark-driven cleanup — Arrow-native, continuous per-record matching)
- LookupJoin (async JDBC with LRU cache via pgx — Arrow-native, external I/O)
- TemporalJoin (versioned state in Pebble — Arrow-native, point-in-time lookups)

**More Connectors:**
- JDBC source/sink (PostgreSQL via pgx)
- File source/sink (Parquet via Arrow Go Parquet)

**Benchmark: NEXMark Subset (q0–q8, q11–q12)**
- Port NEXMark data generator: Person, Auction, Bid event streams with configurable rate and temporal distribution
- Implement NEXMark queries as Isotope pipelines (both TSX and Go API):
  - q0 (passthrough) — raw source→sink baseline
  - q1 (currency conversion) — Map with arithmetic
  - q2 (selection) — Filter with range predicate
  - q3 (local item suggestion) — Person × Auction hash join
  - q4 (avg price per category) — Join + tumble window + aggregate
  - q5 (hot items) — Sliding window + TopN
  - q7 (highest bid) — Tumble window + max aggregate
  - q8 (monitor new users) — Tumble window join
  - q11 (user sessions) — Session window
  - q12 (processing time windows) — Processing time semantics
- Correctness validation: compare output against a reference implementation (Flink SQL on same input)
- Performance measurements: throughput, state size, checkpoint overhead per query

#### Documentation Chapters

| Chapter | Key Concepts | Exercises |
|---------|-------------|-----------|
| `state-and-time/event-time-vs-processing` | Time domains, ordering guarantees, why wall-clock is unreliable | Process out-of-order events and observe the difference |
| `state-and-time/watermarks` | Bounded disorder, watermark generation strategies, propagation through DAGs | Implement a watermark tracker with multi-input min-watermark |
| `state-and-time/lsm-trees` | Memtable, SST levels, compaction strategies, read/write amplification | Benchmark Pebble with different compaction settings |
| `state-and-time/keyed-state` | State interface design, serialization strategies, key encoding | Implement ValueState with custom serialization |
| `state-and-time/key-group-encoding` | Key-group assignment, prefix scan, rescaling math | Demonstrate state redistribution by splitting key groups |
| `state-and-time/tumble-windows` | Fixed window assignment, accumulator lifecycle, trigger semantics | Count events per 5-second tumble window |
| `state-and-time/slide-windows` | Multi-window assignment, shared state optimization | Compare slide window memory usage vs tumble |
| `state-and-time/session-windows` | Gap detection, window merging, merge-on-arrival algorithm | Implement session windows for clickstream data |
| `state-and-time/late-data` | Allowed lateness, retraction, update-and-retract semantics | Process late events and observe retraction messages |
| `state-and-time/hash-joins` | Build/probe phases, memory management, output ordering | Join two Kafka topics by key |
| `state-and-time/interval-joins` | Time bounds, state cleanup timing, watermark interaction | Join orders + payments within 30 minutes |
| `state-and-time/temporal-joins` | Versioned state, point-in-time lookup, changelog semantics | Join events with a slowly-changing dimension table |
| `state-and-time/lookup-joins` | Async I/O pattern, LRU cache, cache invalidation strategies | Build a lookup join with configurable cache TTL |
| `state-and-time/nexmark-benchmark` | NEXMark data model (Person/Auction/Bid), query classification (stateless/windowed/join/complex), correctness validation against reference, performance profiling methodology, identifying bottlenecks | Run q0–q8 and profile each: where is time spent? Which query stresses state the most? Compare your throughput to published Flink/Arroyo numbers and explain the gaps. |

#### What Could Go Wrong

| Risk | Likelihood | Impact on Learning |
|------|------------|-------------------|
| **Session window merge logic is subtle** — Merging overlapping sessions when a late event bridges two existing sessions is an algorithmic challenge. Getting the state cleanup right is harder. | Very High | **Exceptional** — session windows are poorly explained everywhere. Your chapter will be one of the best resources on the internet. |
| **Join state management is the hardest problem** — IntervalJoin alone requires: both-sides storage with time index, efficient probing within time bounds, watermark-driven cleanup, checkpoint/restore correctness. | Very High | **Exceptional** — each join type teaches different state management patterns. This is the core of streaming expertise. |
| **Pebble compaction stalls under write pressure** — Periodic latency spikes during compaction catch-up. | Medium | **High** — teaches LSM tree write amplification. The `lsm-trees` chapter benefits from this real experience. |
| **Watermark propagation bugs cause data loss or infinite buffering** — If watermarks advance too fast, windows fire prematurely (data loss). Too slow, windows never fire (infinite state growth). | High | **Excellent** — the `watermarks` chapter needs real debugging stories. |

#### Checkpoint: Phase 2 → Phase 3

Proceed when ALL of the following are true:
- [ ] All 28 FlinkReactor example pipelines produce correct output on the Go runtime
- [ ] Pebble handles 1M keys with ≤10ms p99 get latency
- [ ] Window state is correctly evicted after lateness expires (no memory leaks over 24h)
- [ ] IntervalJoin produces identical output to Flink for the order-payment join example
- [ ] **NEXMark q0–q8, q11–q12 run correctly** with published results:
  - [ ] All queries produce correct output validated against Flink reference
  - [ ] Throughput and state-size measurements published per query
  - [ ] Performance gap vs Flink documented with profiling-based explanation (e.g., "q4 is 3x slower because hash join probes Pebble per-row instead of batched lookups")
  - [ ] Results published in `state-and-time/nexmark-benchmark` chapter
- [ ] All 14 documentation chapters written with exercises

---

### Phase 3: Fault Tolerance (Months 6–8)
*"How does a stream processor survive failure?"*

#### Learning Objectives

By the end of Phase 3, you will deeply understand:
- Chandy-Lamport distributed snapshot algorithm (the original 1985 paper)
- How Flink adapted Chandy-Lamport for streaming (barrier-based snapshots)
- Aligned vs unaligned checkpointing — tradeoffs and implementation differences
- Exactly-once semantics: what it actually means, common misconceptions
- Two-phase commit protocol (2PC) for end-to-end exactly-once
- Recovery protocols: checkpoint selection, state restore, offset reset, transaction cleanup
- Failure modes in distributed streaming: network partitions, slow nodes, split-brain

#### What We Build

**Checkpointing:**
- Checkpoint coordinator (JobManager-side barrier injection)
- Barrier propagation through operator DAG
- Barrier alignment with record buffering (aligned mode)
- Pebble state snapshots via `Checkpoint()` (hardlinked, ~1ms)
- Checkpoint metadata storage (local filesystem → S3 in Phase 4)
- Checkpoint acknowledge protocol
- State restore from checkpoint on process restart

**At-Least-Once:**
- Checkpoint state + source offsets
- Source replay from checkpointed Kafka offsets
- Non-transactional sink writes (may produce duplicates on recovery)

**Exactly-Once (progressive):**
- Idempotent sinks: upsert semantics (JDBC upsert, Kafka key-based dedup)
- Kafka transactional sink: producer transactions coordinated with checkpoint barriers
- Two-phase commit coordinator: pre-commit on barrier, commit on checkpoint-complete

**Failure Testing:**
- Process kill + restart recovery test suite
- State corruption detection (checksum validation)
- Checkpoint timeout handling

#### Documentation Chapters

| Chapter | Key Concepts | Exercises |
|---------|-------------|-----------|
| `fault-tolerance/chandy-lamport` | The original algorithm, marker messages, consistent cuts | Implement Chandy-Lamport for a network of goroutines (no streaming, pure algorithm) |
| `fault-tolerance/barrier-alignment` | Flink's adaptation: barriers in data channels, alignment buffering, memory pressure | Kill a pipeline mid-flight and verify recovery produces correct output |
| `fault-tolerance/unaligned-checkpoints` | Buffer barriers in-flight (FLIP-76), reduced alignment wait, higher checkpoint size | Compare aligned vs unaligned under data skew |
| `fault-tolerance/state-snapshots` | Pebble `Checkpoint()`, hardlinks, snapshot isolation, incremental snapshots | Measure snapshot time for 1GB, 10GB, 100GB state |
| `fault-tolerance/exactly-once-semantics` | Source replay + state restore + sink idempotence/transactions. Debunk "exactly-once processing" vs "exactly-once delivery" | Run a pipeline, kill it, recover, verify no duplicates in output |
| `fault-tolerance/two-phase-commit` | Coordinator protocol, prepare/commit/abort, timeout handling, zombie transactions | Implement Kafka transactional sink with checkpoint coordination |
| `fault-tolerance/recovery-protocol` | Checkpoint selection, state download, operator re-initialization, offset reset | Benchmark recovery time for different state sizes |
| `fault-tolerance/failure-modes` | Network partitions, slow nodes, split-brain, data corruption, Byzantine failures | Inject failures (kill nodes, slow disk, partition network) and observe behavior |

#### What Could Go Wrong

| Risk | Likelihood | Impact on Learning |
|------|------------|-------------------|
| **Barrier alignment correctness takes months** — Edge cases with multi-input operators, partial barriers, and timeouts are extremely subtle. Flink's implementation is ~50K lines of Java. | Very High | **This is the most valuable learning in the entire project.** Each bug teaches a distributed systems principle. Don't rush it. |
| **Exactly-once with Kafka is unsolved in Go** — No reference implementation. You're working from the Kafka protocol spec and Flink's Java implementation. | High | **Exceptional** — very few engineers have done this. The 2PC chapter will be rare, high-value content. |
| **Recovery time scales linearly with state size** — 100GB state = 100GB download from checkpoint storage. | Medium | **High** — teaches the motivation for incremental checkpointing. Good content for the state-snapshots chapter. |
| **Checkpoint metadata management is fiddly** — Tracking which checkpoints are complete, cleaning up old checkpoints, handling partial failures during checkpoint. | High | **Medium** — important but less interesting to write about. Keep the chapter focused. |

#### Checkpoint: Phase 3 → Phase 4

Proceed when ALL of the following are true:
- [ ] At-least-once checkpointing: kill-and-recover produces correct output for all example pipelines
- [ ] Checkpoint interval of 10 seconds for a pipeline with 1GB state
- [ ] Kafka transactional sink: exactly-once verified by counting output records after kill-and-recover
- [ ] Recovery time: ≤60 seconds for 10GB state from local checkpoint
- [ ] All 8 documentation chapters written with exercises

---

### Phase 4: Distribution (Months 8–11)
*"How does a stream processor scale across machines?"*

#### Learning Objectives

By the end of Phase 4, you will deeply understand:
- Data shuffling: hash partitioning, broadcast, range partitioning
- Apache Arrow Flight: zero-copy network transfer via gRPC
- gRPC internals: HTTP/2 multiplexing, flow control, keepalives
- Credit-based flow control: backpressure theory, credit protocol, deadlock prevention
- Consistent hashing and key-group assignment for state partitioning
- The Job Manager / Task Manager architecture (Flink's model)
- Service discovery patterns: etcd, K8s headless services
- Rescaling: savepoint → redistribute key groups → resume

#### What We Build

**Multi-Node Execution:**
- Arrow Flight server/client for inter-node RecordBatch transfer
- Hash partitioner (Murmur3 on key columns)
- Broadcast partitioner (small-table joins)
- Round-robin partitioner (stateless operators)

**Credit-Based Backpressure:**
- Credit protocol for cross-node gRPC streams
- Deadlock detection at graph construction time
- Credit timeout with back-off

**Cluster Management:**
- Job Manager: pipeline lifecycle, checkpoint triggering, task scheduling
- Task Manager: goroutine slot management, resource reporting
- etcd-based service discovery and leader election
- Heartbeat protocol between JM and TMs

**Rescaling:**
- Savepoint trigger → stop pipeline
- Key-group redistribution algorithm
- State restore with new key-group assignment
- Resume from redistributed state

#### Documentation Chapters

| Chapter | Key Concepts | Exercises |
|---------|-------------|-----------|
| `distribution/shuffle-and-partitioning` | Hash, broadcast, round-robin, range; choosing the right strategy per operator | Measure throughput with different partitioning strategies |
| `distribution/arrow-flight` | Arrow IPC format, Flight RPC, DoGet/DoPut/DoExchange, zero-copy | Build a simple Flight server/client that transfers RecordBatches |
| `distribution/grpc-streaming` | HTTP/2 frames, multiplexing, flow control windows, keepalives | Observe gRPC flow control behavior under load |
| `distribution/credit-based-flow` | Credit protocol, buffer sizing, deadlock prevention in diamond DAGs | Implement credit-based channels and test with 10x speed mismatch |
| `distribution/consistent-hashing` | Key-group assignment, virtual nodes, minimal redistribution on rescale | Visualize key distribution before and after adding a node |
| `distribution/job-manager` | Coordinator responsibilities, checkpoint triggering, failure detection | Implement JM that detects TM failure and triggers recovery |
| `distribution/task-manager` | Worker lifecycle, slot management, resource isolation, memory accounting | Run multiple operators in isolated slots with memory limits |
| `distribution/service-discovery` | etcd leases, K8s endpoints, gossip protocols, failure detection | Set up 3-node cluster with etcd discovery |
| `distribution/rescaling` | Savepoint creation, key-group math, state redistribution, resume protocol | Scale a pipeline from 4→8 parallelism and verify correct output |

#### What Could Go Wrong

| Risk | Likelihood | Impact on Learning |
|------|------------|-------------------|
| **Arrow Flight adds unexpected latency** — 2-5ms per hop compounds through deep DAGs. Network serialization overhead may negate "zero-copy" claims. | Medium | **High** — teaches the gap between theory ("zero-copy") and practice (kernel buffers, TLS overhead, gRPC framing). Great content for the Arrow Flight chapter. |
| **Credit-based backpressure deadlocks in diamond DAGs** — Classic distributed systems problem. | Medium | **Exceptional** — deadlock detection and prevention algorithms are fundamental CS. The chapter on this will be excellent. |
| **etcd learning curve** — etcd's consistency model, lease management, and watch API have subtle behaviors. | Medium | **Good** — distributed coordination is a core skill. |
| **Rescaling correctness is hard to verify** — Ensuring no state is lost or duplicated during key-group redistribution requires careful testing. | High | **High** — teaches the importance of property-based testing for distributed state. |

#### Checkpoint: Phase 4 → Phase 5

Proceed when ALL of the following are true:
- [ ] 3-node cluster runs a windowed aggregation with correct output
- [ ] Arrow Flight shuffle: ≥1 GB/s between two nodes on local network
- [ ] Credit-based backpressure: stable under 10x producer/consumer speed mismatch, no deadlocks
- [ ] Rescale 4→8 parallelism with correct output after redistribution
- [ ] All 9 documentation chapters written with exercises

---

### Phase 5: SQL & Query Compilation (Months 11–13)
*"How does a stream processor compile and optimize queries?"*

#### Learning Objectives

By the end of Phase 5, you will deeply understand:
- SQL parsing: grammar, tokenization, AST construction
- Relational algebra: Scan, Filter, Project, Aggregate, Join operators
- Logical plan → physical plan translation
- Query optimization: predicate pushdown, projection pruning, operator fusion
- Vectorized execution: column-at-a-time processing, SIMD opportunities
- Cost models: cardinality estimation, selectivity, join ordering

#### What We Build

**SQL Layer:**
- vitess/sqlparser integration with streaming SQL extensions (TUMBLE, HOP, SESSION)
- Logical plan builder from SQL AST
- Physical plan generator (parallelism, shuffle insertion)
- Optimizer: predicate pushdown, projection pruning, operator fusion
- Tier 1 SQL: SELECT, WHERE, GROUP BY, HAVING, JOIN, window functions
- `<RawSQL>` and `<Query>` TSX components backed by SQL layer

**Optimizer:**
- Rule-based optimizer (predicate pushdown, projection pruning)
- Operator fusion (adjacent stateless operators → single goroutine)
- Cost model for join ordering (basic)

**Benchmark: Full NEXMark (all 22 queries) + TPC-H Stream**
- Complete all remaining NEXMark queries (q9–q10, q13–q22) via the SQL layer
- TPC-H stream adaptation:
  - Generator: port TPC-H `dbgen` output to Kafka topics (lineitem, orders, customer, nation, region, part, partsupp, supplier)
  - Implement adapted queries: Q1 (pricing summary), Q3 (shipping priority), Q5 (local supplier volume), Q6 (forecasting revenue), Q10 (returned items)
  - Scale factor testing: SF-1 (1GB), SF-10 (10GB)
- Measure optimizer impact: run each query with and without predicate pushdown / projection pruning / operator fusion
- Publish query plan visualizations (before/after optimization) in documentation

#### Documentation Chapters

| Chapter | Key Concepts | Exercises |
|---------|-------------|-----------|
| `sql-and-optimization/sql-parsing` | Tokenizer, recursive descent, Pratt parsing, AST design | Extend vitess/sqlparser with a custom `EMIT AFTER WATERMARK` clause |
| `sql-and-optimization/logical-plan` | Relational algebra, plan nodes, equivalence rules | Build a logical plan for a 3-table join query |
| `sql-and-optimization/physical-plan` | Parallelism assignment, shuffle insertion, plan fragments | Compare physical plans for the same query at different parallelism levels |
| `sql-and-optimization/predicate-pushdown` | Filter reordering, pushing filters through joins, partition pruning | Demonstrate query speedup from pushdown on a Parquet source |
| `sql-and-optimization/projection-pruning` | Column elimination, early projection, schema narrowing | Measure memory savings from pruning unused columns |
| `sql-and-optimization/operator-fusion` | Chaining stateless operators, reducing channel overhead, pipeline breaking | Benchmark fused vs non-fused execution |
| `sql-and-optimization/vectorized-execution` | Column-at-a-time, null handling, selection vectors, SIMD | Compare vectorized filter vs row-at-a-time filter |
| `sql-and-optimization/cost-model` | Cardinality estimation, histogram statistics, join selectivity | Implement a simple cardinality estimator and test on real data |
| `sql-and-optimization/nexmark-full-and-tpch` | Full NEXMark coverage (22 queries), TPC-H stream adaptation, measuring optimizer impact (before/after), query plan visualization, profiling complex multi-way joins, scale factor testing | Run all 22 NEXMark queries via SQL; run TPC-H Q1/Q3/Q5/Q6/Q10 at SF-1 and SF-10; measure optimizer impact as a speedup ratio; compare results to Phase 2 NEXMark subset (now running through SQL layer — is there overhead?) |

#### What Could Go Wrong

| Risk | Likelihood | Impact on Learning |
|------|------------|-------------------|
| **SQL scope creep** — Users want subqueries, CTEs, window functions (ROW_NUMBER, LAG, LEAD), and every query that works in Flink SQL. Each is individually reasonable; together they're a database. | Very High | **Good** — teaches the art of scoping. Document what you chose NOT to implement and why in the chapter on logical plans. |
| **vitess/sqlparser is MySQL-dialect** — Flink SQL extensions (TUMBLE, HOP, SESSION, EMIT) aren't in the grammar. | High | **Excellent** — extending a production SQL parser teaches parser engineering deeply. |
| **Cost model requires statistics** — Without table statistics, the optimizer makes bad decisions. But collecting statistics for streaming sources is an unsolved problem. | Medium | **High** — teaches why streaming query optimization is fundamentally harder than batch. |

#### Checkpoint: Phase 5 → Phase 6

Proceed when ALL of the following are true:
- [ ] SQL mode: `SELECT user_id, COUNT(*) FROM events GROUP BY user_id, TUMBLE(ts, INTERVAL '5' MINUTE)` produces correct results
- [ ] Predicate pushdown demonstrably reduces data scanned from Parquet source
- [ ] Operator fusion reduces goroutine count for chained stateless operators
- [ ] **Full NEXMark + TPC-H benchmark suite** with published results:
  - [ ] All 22 NEXMark queries produce correct output via SQL layer
  - [ ] TPC-H Q1, Q3, Q5, Q6, Q10 produce correct output at SF-1
  - [ ] Optimizer impact measured: ≥2x speedup on at least 3 TPC-H queries from predicate pushdown + projection pruning
  - [ ] Query plan visualizations published (before/after optimization)
  - [ ] Results published in `sql-and-optimization/nexmark-full-and-tpch` chapter
- [ ] All 9 documentation chapters written with exercises

---

### Phase 6: Production Operations (Months 13–15)
*"How does a stream processor run in production?"*

#### Learning Objectives

By the end of Phase 6, you will deeply understand:
- Kubernetes Operator pattern: CRDs, reconciliation loops, status management
- Control theory basics for auto-scaling: PID controllers, feedback loops, oscillation prevention
- Observability engineering: metrics cardinality, histogram design, distributed tracing
- Deployment strategies for stateful systems: rolling updates with savepoints, blue-green, canary
- Security in distributed systems: mTLS, RBAC, secrets rotation

#### What We Build

**K8s Operator:**
- IsotopePipeline CRD with spec/status/conditions
- Pipeline controller: create → running → scaling → upgrading → deleting lifecycle
- Savepoint-based upgrades (trigger savepoint → deploy new version → restore)
- Health checks, liveness/readiness probes
- Helm chart for installation

**Auto-Scaling:**
- Reactive scaling: monitor Kafka consumer lag → adjust parallelism
- Cooldown periods to prevent oscillation
- Savepoint-based rescaling integration

**Observability:**
- Prometheus metrics endpoint (throughput, latency, lag, state size, checkpoint duration, GC pauses)
- Structured JSON logging
- Health check API
- Dashboard (port from FlinkReactor, adapt to Go runtime metrics)

**CLI Production Commands:**
- `isotope deploy --target k8s` — synth → container → CRDs → monitor
- `isotope deploy --target docker` — Docker Compose for simple deployments
- `isotope doctor` — validate connectivity, permissions, resources

#### Documentation Chapters

| Chapter | Key Concepts | Exercises |
|---------|-------------|-----------|
| `production/kubernetes-operator` | Operator pattern, controller-runtime, reconciliation, level-triggered vs edge-triggered | Build a minimal operator that manages a single pod |
| `production/crd-design` | Spec vs status, conditions, printer columns, validation webhooks | Design a CRD for a new resource type |
| `production/auto-scaling` | PID controller basics, lag-based scaling, cooldown, oscillation prevention | Implement a simple autoscaler and test with simulated load |
| `production/observability` | RED metrics, histogram design, label cardinality, alert design | Set up Prometheus + Grafana dashboard for a running pipeline |
| `production/deployment-strategies` | Rolling update with savepoints, blue-green, canary, rollback | Perform a zero-downtime upgrade of a running pipeline |
| `production/security` | mTLS setup, RBAC model, secrets management, audit logging | Configure mTLS between JM and TMs |

#### What Could Go Wrong

| Risk | Likelihood | Impact on Learning |
|------|------------|-------------------|
| **K8s operator is a product, not a feature** — CRD versioning, webhook validation, leader election, RBAC, Helm charts each take a week. | High | **Good** — teaches the full lifecycle of K8s-native software. This is directly career-relevant. |
| **Auto-scaling feedback loops** — Scale up → rebalance → throughput drops → scale up more → oscillation. | Medium | **Excellent** — teaches control theory. The auto-scaling chapter will explain PID controllers and dampening. |
| **Dashboard API mismatch** — Go runtime metrics differ from Flink REST API. The FlinkReactor dashboard needs significant adaptation. | Medium | **Low** — this is web dev work, not streaming systems learning. Keep it minimal. |

#### Checkpoint: Phase 6 Complete

The project is complete when:
- [ ] `isotope deploy --target k8s` deploys a pipeline to a K8s cluster
- [ ] Auto-scaling adjusts parallelism based on lag, with dampening
- [ ] Grafana dashboard shows all key metrics for a running pipeline
- [ ] Zero-downtime upgrade via savepoint + redeploy
- [ ] All 6 documentation chapters written with exercises
- [ ] Full course documentation site is deployed and navigable

---

## 9. Benchmarking Strategy

Benchmarking a streaming system is fundamentally different from benchmarking a database. You're measuring throughput under continuous load, latency at percentiles (not averages), correctness under failure, and behavior under backpressure — all simultaneously. The industry has converged on a few standard benchmarks, and we adopt them progressively as the runtime gains capabilities.

### Three Benchmark Tiers

| Tier | Benchmark | When | What It Validates |
|------|-----------|------|-------------------|
| **1. Baseline** | **Yahoo Streaming Benchmark (YSB)** | Phase 1 | Raw throughput + latency for stateless pipelines. Simple: Kafka → filter → window → count. Proves the data path works end-to-end. |
| **2. Streaming** | **NEXMark (subset: q0–q8)** | Phase 2 | Stateful correctness + performance. Covers filters (q1–q2), tumbling windows (q5, q7), session windows (q8), and stream-stream joins (q3–q4). Proves state, time, and joins work. |
| **3. Full Suite** | **NEXMark (all 22 queries) + TPC-H Stream** | Phase 5 | SQL layer completeness + query optimization impact. NEXMark queries exercise the full SQL parser and planner. TPC-H tables as append-only streams test join ordering and aggregation at scale. |

### NEXMark Data Model

NEXMark models an online auction system with three event streams:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    Person     │     │   Auction     │     │     Bid       │
├──────────────┤     ├──────────────┤     ├──────────────┤
│ id: BIGINT   │     │ id: BIGINT   │     │ auction: BIGINT│
│ name: STRING │     │ seller: BIGINT│    │ bidder: BIGINT │
│ email: STRING│     │ category: INT │    │ price: BIGINT  │
│ city: STRING │     │ initial_bid   │    │ channel: STRING│
│ state: STRING│     │ reserve: BIGINT│   │ url: STRING    │
│ date_time    │     │ date_time     │    │ date_time      │
│ ...          │     │ expires       │    │ ...            │
│              │     │ ...           │    │                │
└──────────────┘     └──────────────┘     └──────────────┘
```

### NEXMark Query Mapping to Isotope Capabilities

| Query | Description | Isotope Feature Tested | Phase |
|-------|-------------|---------------------------|-------|
| q0 | Passthrough | Kafka source → sink throughput | 1 (YSB) |
| q1 | Currency conversion | Map (arithmetic expression) | 1 (YSB) |
| q2 | Selection | Filter (WHERE clause) | 1 (YSB) |
| q3 | Local item suggestion | Stream-stream join (Person × Auction) | 2 |
| q4 | Average price per category | Join + tumbling window aggregate | 2 |
| q5 | Hot items | Sliding window + TopN | 2 |
| q7 | Highest bid | Tumbling window + max aggregate | 2 |
| q8 | Monitor new users | Tumbling window join (Person × Auction) | 2 |
| q9 | Winning bids | Multi-way join + window | 5 (SQL) |
| q11 | User sessions | Session window | 2 |
| q12 | Processing time windows | Processing time semantics | 2 |
| q13 | Bounded side input | Hybrid bounded/unbounded join | 5 (SQL) |
| q14–q22 | Extended queries | Complex SQL, subqueries, CEP | 5 (SQL) |

### Yahoo Streaming Benchmark (YSB) Pipeline

YSB is intentionally simple — it isolates the data path:

```
Kafka ("ad-events")
  → Filter (event_type = 'view')
  → Map (project: ad_id, event_time)
  → KeyBy (ad_id)
  → Tumble Window (10 seconds)
  → Count per ad_id
  → Kafka ("ad-view-counts") or Redis
```

**Metrics collected**: events/sec (throughput), p50/p95/p99 latency, GC pause distribution, CPU utilization, memory usage.

### TPC-H Stream Adaptation (Phase 5)

TPC-H's 8 tables (lineitem, orders, customer, nation, etc.) are treated as append-only Kafka topics. A subset of TPC-H queries that translate naturally to streaming:

| TPC-H Query | Streaming Adaptation | What It Tests |
|-------------|---------------------|---------------|
| Q1 (pricing summary) | Tumbling window aggregate on lineitem | Window + multi-column aggregation |
| Q3 (shipping priority) | 3-table stream join (customer × orders × lineitem) | Multi-way join ordering |
| Q5 (local supplier volume) | 6-table join + aggregation | Join planning and optimization |
| Q6 (forecasting revenue) | Filter + sum on lineitem stream | Predicate pushdown into source |
| Q10 (returned item reporting) | Join + filter + aggregate | Complex query plan optimization |

**Scale factors**: SF-1 (1GB), SF-10 (10GB), SF-100 (100GB) for throughput scaling tests.

### What Could Go Wrong: Benchmarking

| Risk | Likelihood | Learning Impact | Mitigation |
|------|------------|-----------------|------------|
| **Benchmark results look bad vs Flink/Arroyo** — Flink has 10+ years of optimization, Arroyo uses Rust. Your Go runtime will be slower. | Very High | **Good** — forces you to understand WHERE the bottleneck is (serialization? GC? expression eval? state access?). Profiling is the best teacher. | Document the gap honestly. Write "why is Flink faster?" sections that explain each optimization you haven't implemented yet. This is more valuable than inflated numbers. |
| **NEXMark data generator is non-trivial** — Generating realistic auction data with proper temporal distribution, bid/auction correlations, and configurable event rate requires careful implementation. | Medium | **Good** — teaches data generation for streaming, which is itself a useful skill. | Port the Beam NEXMark generator logic. The generator itself is a good exercise for the `benchmarking-streaming-systems` chapter. |
| **TPC-H queries expose SQL layer gaps** — Q5 requires 6-way join optimization. Without a cost model, the plan will be terrible. | High | **Excellent** — this is exactly why TPC-H is useful: it forces you to build a real optimizer. Document the before/after query plans in the `cost-model` chapter. |

### Benchmark Infrastructure

All benchmarks run in a reproducible Docker Compose environment:

```
docker/benchmark/
├── docker-compose.yml          # Kafka (3 brokers), Go runtime, Prometheus, Grafana
├── generators/
│   ├── ysb-generator/          # YSB ad-event generator (configurable rate)
│   ├── nexmark-generator/      # NEXMark Person/Auction/Bid generator
│   └── tpch-generator/         # TPC-H table stream generator (dbgen → Kafka)
├── dashboards/
│   └── grafana-benchmark.json  # Pre-built dashboard: throughput, latency, GC, state size
└── scripts/
    ├── run-ysb.sh              # Run YSB at 100K, 500K, 1M events/sec
    ├── run-nexmark.sh          # Run NEXMark q0-q22 sequentially
    └── run-tpch.sh             # Run TPC-H adapted queries at SF-1, SF-10
```

Results are published in the documentation site under each phase's benchmark chapter, with reproducible instructions so readers can run them on their own hardware.

---

## 10. Where Isotope Fits in the Landscape


This section isn't about competition — it's about understanding the design space that existing systems occupy, so you can make informed architectural decisions.

```
                    High Throughput
                         │
                   Flink │ Spark Streaming
                         │
                    ★ Isotope
                    (learning target)
     Complex ────────────┼──────────── Simple
     Operations          │              Operations
                         │
              Arroyo     │
                         │
                RisingWave│  Quix / Bytewax
                         │
                    Low Throughput
```

**What to learn from each:**
- **Flink**: The gold standard. Study its checkpointing (FLIP-1, FLIP-76), state backends, watermark implementation. Read the code when stuck.
- **Arroyo**: A Rust streaming engine built by 2 people. Proof that a small team can build a real runtime. Study their Arrow-native approach and SQL layer.
- **RisingWave**: Streaming database in Rust. Study their storage engine and exactly-once design.
- **Materialize**: Differential dataflow in Rust. Study their approach to incremental computation.
- **Benthos/Redpanda Connect**: Go-based stream processor. Study their connector architecture and pipeline model.

---

## 11. What Could Go Wrong: The Big Picture

### 11.1 Scope vs Depth Tradeoff

**The risk**: You try to build everything (all operators, all connectors, all deployment targets, SQL layer, K8s operator) and end up with shallow implementations of each. The documentation chapters are thin because you didn't spend enough time on any one subsystem to truly understand it.

**Mitigation**: Go deep on a few things rather than wide on everything. Phase 2 (state + windowing + joins) and Phase 3 (checkpointing) are where the deepest learning happens. It's fine if Phase 5 (SQL) is a basic implementation and Phase 6 (K8s) is minimal. The course is about streaming internals, not about building a production-ready product.

### 11.2 Documentation Debt

**The risk**: You build code and keep telling yourself you'll write the chapter later. By Phase 3, you have 6 months of unwritten documentation and the code has evolved past what you remember.

**Mitigation**: The checkpoint gates are strict: you cannot proceed to the next phase until ALL documentation chapters for the current phase are written. This is a hard rule.

### 11.3 Premature Optimization

**The risk**: You spend 2 weeks optimizing Pebble compaction settings or Arrow batch size before you have correct end-to-end behavior. Performance tuning is interesting but it's a trap when correctness isn't proven.

**Mitigation**: Each phase has a correctness gate (e.g., "all 28 examples produce correct output") before performance tuning is allowed. Document performance findings in the chapters but don't block progress on them.

### 11.4 Losing Motivation at Phase 3

**The risk**: Phases 1-2 are exciting (things work! data flows! windows fire!). Phase 3 (checkpointing) is grinding: subtle correctness bugs, days spent on edge cases, no visible progress. This is where most hobby streaming projects die.

**Mitigation**: The documentation chapters give you a tangible output even when the code is stuck. Writing the `chandy-lamport` chapter forces you to understand the algorithm deeply, which often unblocks the implementation. Also: Phase 3 is where the portfolio value is highest. Anyone can build a stateless pipeline. Very few have implemented Chandy-Lamport from scratch.

### 11.5 Risk Heatmap

```
                        Low Impact ───────────── High Impact
                        │                              │
  Very Likely ──────────┤                              │
                        │  Arrow API verbosity     Expression parser complexity
                        │  Build system pain       Join state management
                        │  Franz-go edge cases     Documentation debt
                        │  Benchmark gap vs Flink  DuckDB micro-batch tuning
                        │  DuckDB CGO build pain
                        │                              │
  Likely ───────────────┤                              │
                        │  Pebble tuning           Checkpoint correctness bugs
                        │  vitess/sqlparser gaps   Scope vs depth tradeoff
                        │  K8s operator scope      Losing motivation at Phase 3
                        │                              │
  Unlikely ─────────────┤                              │
                        │  etcd learning curve     Diamond DAG deadlocks
                        │                          Exactly-once Kafka unsolved
                        │                              │
  Rare ─────────────────┤                              │
                        │                          Silent checkpoint inconsistency
                        │                          Arrow memory layout change
                        │                              │
                        └──────────────────────────────┘
```

---

## 12. Code Examples

Each example is annotated with its **execution strategy** — whether operators run as Arrow-native compute kernels or as DuckDB micro-batch SQL.

---

### Example 1: Simple ETL — Kafka → Filter → Map → Kafka
**Strategy: Arrow-Native** — All operators are stateless. No GROUP BY, no window, no state.

```tsx
import { Pipeline, KafkaSource, KafkaSink, Filter, Map } from '@isotope/dsl'
import { Schema, Field } from '@isotope/dsl/schema'

const ClickEvent = Schema({
  fields: {
    user_id:    Field.BIGINT(),
    page_url:   Field.STRING(),
    clicked_at: Field.TIMESTAMP(3),
    country:    Field.STRING(),
  },
  watermark: { column: 'clicked_at', expression: "clicked_at - INTERVAL '5' SECOND" },
})

export default () => (
  <Pipeline name="click-to-pageview" parallelism={4}>
    <KafkaSource topic="click-events" schema={ClickEvent} />
    <Filter condition="country = 'US'" />
    <Map select={{
      user_id:   'user_id',
      page_path: "REGEXP_EXTRACT(page_url, '^https?://[^/]+(/.*)$', 1)",
      viewed_at: 'clicked_at',
    }} />
    <KafkaSink topic="page-views-us" keyBy="user_id" />
  </Pipeline>
)
```

**Execution strategy per operator:**
| Operator | Strategy | Why |
|----------|----------|-----|
| KafkaSource | — | Source connector |
| Filter | Arrow-native | Stateless. `country = 'US'` → `compute.Equal` → boolean mask |
| Map | Arrow-native | Stateless. Column projection + `REGEXP_EXTRACT` as batch regex kernel |
| KafkaSink | — | Sink connector |

Filter + Map are chained in the same goroutine (FORWARD shuffle = zero-copy pointer pass).

---

### Example 2: Windowed Aggregation — Revenue per Product
**Strategy: DuckDB Micro-Batch** — TumbleWindow defines a bounded set. GROUP BY + SUM + COUNT is pure SQL.

```tsx
export default () => (
  <Pipeline name="product-revenue" parallelism={8}>
    <KafkaSource topic="orders" schema={OrderSchema}
      watermark={{ column: 'ordered_at', expression: "ordered_at - INTERVAL '10' SECOND" }} />
    <TumbleWindow size="5 MINUTE" on="ordered_at">
      <Aggregate groupBy={['product_id']} select={{
        product_id: 'product_id', total_revenue: 'SUM(amount)', order_count: 'COUNT(*)',
      }} />
    </TumbleWindow>
    <IcebergSink catalog="lakehouse" database="analytics" table="product_revenue_5min" />
  </Pipeline>
)
```

**Execution strategy per operator:**
| Operator | Strategy | Why |
|----------|----------|-----|
| KafkaSource | — | Source connector |
| TumbleWindow + Aggregate | **DuckDB** | Window close = micro-batch boundary. Accumulated records → DuckDB. |
| IcebergSink | — | Sink connector |

**What DuckDB executes when the window fires:**
```sql
-- Runs once per 5-minute window, on the bounded set of records in that window
SELECT product_id, SUM(amount) AS total_revenue, COUNT(*) AS order_count
FROM window_batch
GROUP BY product_id
```

This is the canonical DuckDB micro-batch use case. The window accumulates all order records for a 5-minute period. When the watermark advances past the window end, the entire batch is loaded into an isolated DuckDB instance via `RegisterView` (zero-copy Arrow), the SQL runs, and results are emitted as a new Arrow RecordBatch.

---

### Example 3: Interval Join — Orders + Payments
**Strategy: Arrow-Native + Pebble** — Continuous time-bounded matching with no natural batch boundary.

```tsx
export default () => (
  <Pipeline name="order-payment-join" parallelism={8}>
    <IntervalJoin
      left={<KafkaSource topic="orders" schema={OrderSchema}
              watermark={{ column: 'ordered_at', expression: "ordered_at - INTERVAL '5' SECOND" }} />}
      right={<KafkaSource topic="payments" schema={PaymentSchema}
               watermark={{ column: 'paid_at', expression: "paid_at - INTERVAL '5' SECOND" }} />}
      on="l.order_id = r.order_id"
      between={['-1 MINUTE', '30 MINUTE']}
    />
    <Map select={{
      order_id: 'l.order_id', user_id: 'l.user_id', amount: 'l.amount',
      status: 'r.status', latency_ms: 'TIMESTAMPDIFF(MILLISECOND, l.ordered_at, r.paid_at)',
    }} />
    <KafkaSink topic="paid-orders" keyBy="order_id" />
  </Pipeline>
)
```

**Execution strategy per operator:**
| Operator | Strategy | Why |
|----------|----------|-----|
| IntervalJoin | **Arrow-native + Pebble** | Records arrive asynchronously on both sides. Each order probes buffered payments within `[-1min, +30min]`. State cleanup on watermark. No batch boundary. |
| Map | Arrow-native | Stateless projection on joined output |

**Why NOT DuckDB:** When an order record arrives, it must immediately probe against all payments received so far within the time interval. A payment that matches might arrive 30 minutes later. This is fundamentally a streaming operation — each record triggers a state lookup, not a batch computation. DuckDB can't help here because there's no point at which you have "all the data" for this operation.

---

### Example 4: CDC → Deduplicate → Lakehouse
**Strategy: Arrow-Native + Pebble** — Per-record key tracking with time-based retention.

```tsx
export default () => (
  <Pipeline name="user-cdc-to-lakehouse" parallelism={4}>
    <KafkaSource topic="dbserver1.public.users" schema={UserProfileSchema}
      format="debezium-json"
      watermark={{ column: 'updated_at', expression: "updated_at - INTERVAL '30' SECOND" }} />
    <Deduplicate key="user_id" within="1 HOUR" keepLast />
    <IcebergSink catalog="lakehouse" database="raw" table="users"
      upsertKey={['user_id']} partitionBy={['DAYS(updated_at)']} />
  </Pipeline>
)
```

**Execution strategy per operator:**
| Operator | Strategy | Why |
|----------|----------|-----|
| Deduplicate | **Arrow-native + Pebble** | Each CDC record checks Pebble: "have I seen user_id X in the last hour?" If yes, suppress (or replace if `keepLast`). `within` is a TTL for state, not a computation boundary. |

**Why NOT DuckDB:** Deduplicate is per-record state management. Each incoming record must check and update state immediately. The `within="1 HOUR"` parameter controls how long the key is remembered (state TTL), not a window of data to process together. Loading each record into DuckDB to check `NOT EXISTS (SELECT 1 FROM seen WHERE key = ?)` would add SQL overhead for what's a simple Pebble `Get`/`Put`.

---

### Example 5: Fan-Out Routing
**Strategy: Arrow-Native** — Stateless conditional fan-out.

```tsx
export default () => (
  <Pipeline name="event-router" parallelism={4}>
    <KafkaSource topic="app-events" schema={AppEventSchema}
      watermark={{ column: 'created_at', expression: "created_at - INTERVAL '5' SECOND" }} />
    <Route>
      <Route.Branch condition="event_type = 'purchase'">
        <KafkaSink topic="purchases" keyBy="user_id" />
      </Route.Branch>
      <Route.Branch condition="event_type = 'error'">
        <KafkaSink topic="app-errors" keyBy="user_id" />
      </Route.Branch>
      <Route.Default>
        <KafkaSink topic="other-events" keyBy="user_id" />
      </Route.Default>
    </Route>
  </Pipeline>
)
```

**Execution strategy per operator:**
| Operator | Strategy | Why |
|----------|----------|-----|
| Route | Arrow-native | Stateless. Evaluate `event_type = 'purchase'` as Arrow boolean mask, split batch by mask. No state, no GROUP BY. |

---

### Example 6: Session Window + Complex Aggregate *(new — DuckDB showcase)*
**Strategy: DuckDB Micro-Batch** — Session window closes → bounded set of all session records → complex SQL.

```tsx
const UserAction = Schema({
  fields: {
    user_id:    Field.BIGINT(),
    action:     Field.STRING(),
    page:       Field.STRING(),
    created_at: Field.TIMESTAMP(3),
  },
  watermark: { column: 'created_at', expression: "created_at - INTERVAL '30' SECOND" },
})

export default () => (
  <Pipeline name="user-sessions" parallelism={8}>
    <KafkaSource topic="user-actions" schema={UserAction} />
    <SessionWindow gap="15 MINUTE" on="created_at">
      <Aggregate groupBy={['user_id']} select={{
        user_id:       'user_id',
        page_count:    'COUNT(DISTINCT page)',
        actions:       'LISTAGG(action)',
        duration_sec:  'TIMESTAMPDIFF(SECOND, MIN(created_at), MAX(created_at))',
      }} />
    </SessionWindow>
    <JdbcSink url="jdbc:postgresql://analytics-db:5432/warehouse" table="user_sessions" />
  </Pipeline>
)
```

**Execution strategy per operator:**
| Operator | Strategy | Why |
|----------|----------|-----|
| SessionWindow + Aggregate | **DuckDB** | Session closes when no activity for 15 min. All session records → DuckDB. Complex functions (`COUNT(DISTINCT ...)`, `LISTAGG`, `TIMESTAMPDIFF`) run natively in DuckDB. |

**What DuckDB executes when a session closes:**
```sql
SELECT
  user_id,
  COUNT(DISTINCT page) AS page_count,
  STRING_AGG(action, ',') AS actions,  -- DuckDB equivalent of LISTAGG
  DATE_DIFF('second', MIN(created_at), MAX(created_at)) AS duration_sec
FROM session_batch
GROUP BY user_id
```

This example showcases why DuckDB shines: `COUNT(DISTINCT ...)`, `STRING_AGG`, and `DATE_DIFF` are complex functions that would each require custom Arrow compute kernel implementations. DuckDB provides all of them out of the box.

---

### Example 7: TopN Per Category *(new — DuckDB showcase)*
**Strategy: DuckDB Micro-Batch** — Window + ORDER BY + LIMIT is a natural SQL operation.

```tsx
export default () => (
  <Pipeline name="top-sellers" parallelism={4}>
    <KafkaSource topic="sales" schema={SaleSchema}
      watermark={{ column: 'sold_at', expression: "sold_at - INTERVAL '10' SECOND" }} />
    <TumbleWindow size="1 HOUR" on="sold_at">
      <TopN n={5} partitionBy={['category']} orderBy="revenue DESC" />
    </TumbleWindow>
    <KafkaSink topic="top-sellers-hourly" keyBy="category" />
  </Pipeline>
)
```

**Execution strategy per operator:**
| Operator | Strategy | Why |
|----------|----------|-----|
| TumbleWindow + TopN | **DuckDB** | Window defines the set. DuckDB runs optimized Top-K with `QUALIFY`. |

**What DuckDB executes:**
```sql
SELECT *
FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY category ORDER BY revenue DESC) AS rn
  FROM window_batch
)
WHERE rn <= 5
```

---

### Example 8: RawSQL Analytics *(new — DuckDB showcase)*
**Strategy: DuckDB Micro-Batch** — User wrote SQL. Execute it literally.

```tsx
export default () => (
  <Pipeline name="sensor-alerts" parallelism={4}>
    <KafkaSource topic="sensor-readings" schema={SensorSchema}
      watermark={{ column: 'reading_at', expression: "reading_at - INTERVAL '10' SECOND" }} />
    <TumbleWindow size="1 MINUTE" on="reading_at">
      <RawSQL>{`
        SELECT
          sensor_id,
          AVG(temperature) AS avg_temp,
          MAX(temperature) AS max_temp,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY temperature) AS p95_temp,
          COUNT(*) AS reading_count
        FROM input
        WHERE temperature > 50
        GROUP BY sensor_id
        HAVING AVG(temperature) > 80
      `}</RawSQL>
    </TumbleWindow>
    <KafkaSink topic="sensor-alerts" keyBy="sensor_id" />
  </Pipeline>
)
```

**Execution strategy per operator:**
| Operator | Strategy | Why |
|----------|----------|-----|
| TumbleWindow + RawSQL | **DuckDB** | User-provided SQL with `PERCENTILE_CONT`, `HAVING`, and pre-filter. Executes verbatim in DuckDB. |

This example demonstrates the power of DuckDB as an escape hatch: `PERCENTILE_CONT` is a complex ordered-set aggregate function that would require significant implementation effort as a custom Arrow operator. In DuckDB, it's a single function call.

---

### Execution Strategy Summary

| Example | Pipeline Pattern | Strategy | Key Operator |
|---------|-----------------|----------|-------------|
| 1 | Filter → Map | **Arrow-native** | Stateless transforms |
| 2 | TumbleWindow + GROUP BY + SUM | **DuckDB** | Windowed aggregation |
| 3 | IntervalJoin | **Arrow-native + Pebble** | Continuous time-bounded join |
| 4 | Deduplicate (per-key TTL) | **Arrow-native + Pebble** | Per-record state tracking |
| 5 | Route (fan-out) | **Arrow-native** | Stateless branching |
| 6 | SessionWindow + COUNT DISTINCT + LISTAGG | **DuckDB** | Session aggregate with complex functions |
| 7 | TumbleWindow + TopN | **DuckDB** | ORDER BY + LIMIT |
| 8 | TumbleWindow + RawSQL (PERCENTILE_CONT) | **DuckDB** | User-provided SQL |

**The pattern**: If there's a **window boundary** (Tumble, Slide, Session) and the operation inside is **SQL-like** (GROUP BY, ORDER BY, HAVING, aggregate functions, joins), it runs in DuckDB. Everything else runs as Arrow-native compute kernels or Arrow-native + Pebble state.

---

## 13. Pure Go API

For maximum control, custom operators, or embedding in a Go service:

```go
package main

import (
    "github.com/isotope-streaming/runtime/pkg/api"
    "github.com/isotope-streaming/runtime/pkg/connector/kafka"
    "github.com/isotope-streaming/runtime/pkg/operator"
    "github.com/isotope-streaming/runtime/pkg/schema"
    "github.com/apache/arrow/go/v17/arrow"
)

func main() {
    clickEvent := schema.New("ClickEvent",
        schema.Field("user_id", arrow.PrimitiveTypes.Int64),
        schema.Field("page_url", arrow.BinaryTypes.String),
        schema.Field("clicked_at", arrow.FixedWidthTypes.Timestamp_ms),
        schema.Field("country", arrow.BinaryTypes.String),
    )

    pipeline := api.NewPipeline("click-to-pageview",
        api.WithParallelism(4),
        api.WithCheckpointInterval(60*time.Second),
    )

    source := kafka.NewSource("click-events",
        kafka.WithSchema(clickEvent),
        kafka.WithWatermark("clicked_at", 5*time.Second),
    )

    filter := operator.NewFilter(func(batch arrow.Record) arrow.Record {
        return operator.FilterByString(batch, "country", "US")
    })

    mapper := operator.NewMap(nil, func(batch arrow.Record) arrow.Record {
        return operator.Project(batch,
            operator.Col("user_id"),
            operator.RegexpExtract("page_url", `^https?://[^/]+(/.*)$`, 1).As("page_path"),
            operator.Col("clicked_at").As("viewed_at"),
        )
    })

    sink := kafka.NewSink("page-views-us", kafka.WithKeyBy("user_id"))

    pipeline.From(source).Via(filter).Via(mapper).To(sink)
    api.Run(pipeline)
}
```

### DuckDB Micro-Batch Operator (Go API)

For windowed aggregations, the Go API lets you define the SQL that DuckDB executes:

```go
// Windowed aggregation via DuckDB — same as Example 2 but in pure Go
pipeline := api.NewPipeline("product-revenue", api.WithParallelism(8))

source := kafka.NewSource("orders",
    kafka.WithSchema(orderEvent),
    kafka.WithWatermark("ordered_at", 10*time.Second),
)

// DuckDB micro-batch: collect records in window, run SQL when window fires
aggregate := duckdb.NewWindowAggregate(
    window.Tumble(5*time.Minute).On("ordered_at"),
    duckdb.SQL(`
        SELECT product_id, SUM(amount) AS total_revenue, COUNT(*) AS order_count
        FROM input
        GROUP BY product_id
    `),
)

sink := iceberg.NewSink("product_revenue_5min",
    iceberg.WithCatalog("lakehouse"),
    iceberg.WithDatabase("analytics"),
)

pipeline.From(source).Via(aggregate).To(sink)
api.Run(pipeline)
```

The `duckdb.NewWindowAggregate` operator:
1. Routes each record to its window via the assigner
2. Buffers Arrow RecordBatches per window
3. On watermark ≥ window end: `RegisterView(buffer, "input")` → execute SQL → emit Arrow result
4. Each parallel instance gets its own isolated `:memory:` DuckDB instance

### Custom Stateful Operator (Arrow-Native + Pebble)

For operations that need per-record state (no natural batch boundary):

```go
// FraudDetector: flag users who exceed $10,000 in purchases within 1 hour
type FraudDetector struct {
    operator.BaseStatefulOperator
    amountState   state.ValueState[float64]
    lastSeenState state.ValueState[int64]
}

func (f *FraudDetector) InitializeState(backend state.Backend) error {
    f.amountState = state.NewValueState[float64](backend, "rolling_amount")
    f.lastSeenState = state.NewValueState[int64](backend, "last_seen")
    return nil
}

func (f *FraudDetector) ProcessBatch(batch arrow.Record) ([]arrow.Record, error) {
    // Process Arrow RecordBatch row-by-row for keyed state access
    // Update Pebble state per user_id
    // Emit flagged records as new RecordBatch
}
```

This is an Arrow-native + Pebble operator because fraud detection checks per-user rolling state as each record arrives — there's no bounded set to batch.

---

## 14. Verification POCs

### POC 1: End-to-End Pipeline (Week 1-2)
Kafka → Filter → Map → Kafka via TypeScript synth → Protobuf → Go runtime → franz-go.
**Measure**: throughput, p99 latency, GC pauses. **Write**: `foundations/` chapters.

### POC 2: Pebble State Backend (Week 2-3)
Keyed ValueState get/put for 1M keys. Checkpoint snapshot and restore.
**Measure**: ops/sec, snapshot latency. **Write**: `state-and-time/lsm-trees` chapter.

### POC 3: Credit-Based Backpressure (Week 3)
Fast producer → slow consumer with credit-based channels.
**Verify**: stability under 10x speed mismatch, no deadlocks. **Write**: `distribution/credit-based-flow` chapter.

### POC 4: Arrow Flight Shuffle (Week 3-4)
Two Go processes exchanging RecordBatches via Arrow Flight.
**Measure**: GB/s throughput. **Write**: `distribution/arrow-flight` chapter.

### POC 5: Expression Evaluator (Week 4)
vitess/sqlparser → Arrow compute for `amount > 100`, `UPPER(name)`, `REGEXP_EXTRACT(...)`.
**Measure**: expressions/sec per batch. **Write**: `foundations/expression-evaluation` chapter.

### POC 6: Windowed Aggregation (Week 5-6)
TumbleWindow + Aggregate with Pebble state + watermark tracking.
**Verify**: correct window emission, late data, cleanup. **Write**: `state-and-time/tumble-windows` chapter.

### POC 7: Protobuf Roundtrip (Week 2, parallel)
TypeScript `synth()` → Protobuf serialize → Go `Load()` → deserialize.
**Verify**: lossless roundtrip. **Write**: `foundations/protobuf-as-contract` chapter.

### POC 8: DuckDB Arrow Bridge (Week 3, parallel with POC 3)
`duckdb/duckdb-go` + Arrow `RegisterView` → `SELECT COUNT(*), SUM(amount) FROM input GROUP BY product_id` → Arrow result.
**Measure**: query overhead per micro-batch at 100, 1K, 10K, 100K records. **Write**: `foundations/duckdb-micro-batch` chapter.

### POC 9: YSB Benchmark Harness (Week 5, parallel with POC 6)
YSB data generator → Kafka → Filter → Window → Count → Kafka. Prometheus metrics collection.
**Measure**: events/sec, p50/p95/p99 latency. **Write**: `foundations/benchmarking-streaming-systems` chapter.

### POC 10: SQL Layer (Week 6-7)
vitess/sqlparser → logical plan → Arrow compute for SELECT/WHERE/GROUP BY/TUMBLE.
**Write**: `sql-and-optimization/sql-parsing` chapter.
