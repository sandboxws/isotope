## Context

FlinkReactor is a production-quality TypeScript DSL that lets users define streaming pipelines in TSX syntax. It compiles ConstructNode trees to Flink SQL + Kubernetes CRDs. Isotope reuses the same TSX front-end but retargets compilation to Protobuf ExecutionPlans consumed by a Go runtime. This is a compiler retargeting — the front-end (DSL) stays the same, the back-end (code generation) changes.

The FlinkReactor source is at `/Users/ahmed/Development/opensource/flink-reactor/src/`. The Isotope target is `packages/dsl/src/`.

## Goals / Non-Goals

**Goals:**
- Port all reusable DSL infrastructure from FlinkReactor to Isotope
- Adapt the type system from Flink SQL types to Arrow types
- Maintain the same TSX user-facing API where possible (component names, prop names)
- Ensure the ConstructNode tree can be consumed by a plan-compiler (built separately)
- All ported code passes unit tests

**Non-Goals:**
- Implementing the plan-compiler (ConstructNode → Protobuf) — that's a separate change
- Implementing the Go runtime — that's phase01-data-in-motion
- Supporting CDC changelog modes beyond APPEND_ONLY — future phases
- Porting Flink-specific components (PaimonSink, IcebergSink, catalogs, UDF JAR management)
- Porting SQL code generation or CRD generation

## Decisions

### Decision 1: Arrow type system via enum, not strings

**Choice:** Replace FlinkReactor's string-based `FlinkType` (`"BIGINT"`, `"VARCHAR(255)"`, `"TIMESTAMP(3)"`) with an `ArrowType` enum (`ARROW_INT64`, `ARROW_STRING`, `ARROW_TIMESTAMP_MS`).

**Rationale:** Arrow types are a closed set — unlike Flink SQL types which include parameterized types with arbitrary precision. An enum provides exhaustive matching and type safety. The `Field` builder API hides this: `Field.BIGINT()` returns `{ type: 'BIGINT', arrowType: ArrowType.ARROW_INT64 }`.

**Tradeoff:** Some Flink SQL type granularity is lost (e.g., `VARCHAR(100)` vs `VARCHAR(255)` both map to `ARROW_STRING`). This is acceptable — Arrow doesn't have length-bounded strings.

### Decision 2: Keep SQL expression strings as-is

**Choice:** All expression props (`condition`, `select`, column expressions) remain raw SQL strings, identical to FlinkReactor.

**Rationale:** Both FlinkReactor and Isotope use SQL strings for expressions. FlinkReactor passes them to Flink SQL verbatim; Isotope passes them to the Go runtime's vitess/sqlparser. The user-facing API is identical: `<Filter condition="amount > 100" />`. No adaptation needed.

### Decision 3: Minimal component API changes

**Choice:** Keep component prop names and structures as close to FlinkReactor as possible. Only change what's strictly necessary for the Arrow/Protobuf target.

**Rationale:** Users familiar with FlinkReactor should find Isotope's TSX API nearly identical. Breaking changes should be rare and well-documented.

**What changes:**
- `KafkaSource.format` — remove CDC formats (debezium-json, canal-json, maxwell-json), keep json/csv
- `KafkaSource.bootstrapServers` — make required (FlinkReactor inherits from infra config)
- `Cast.safe` — remove (TRY_CAST is Flink-specific)
- New: `GeneratorSource` (synthetic data), `ConsoleSink` (stdout)
- Removed: `PaimonSink`, `IcebergSink`, `GenericSink`, `GenericSource`, `CatalogSource`, all catalogs, `UDF`

### Decision 4: Port structure mirrors FlinkReactor

**Choice:** The `packages/dsl/src/` directory structure mirrors FlinkReactor's `src/` structure (`core/`, `components/`, `testing/`).

**Rationale:** Makes the port traceable. Each file in Isotope maps to a specific FlinkReactor file. Diffs between the two projects show exactly what was adapted.

### Decision 5: Separate synthesis from compilation

**Choice:** The ported `synthesizeApp()` function produces a validated ConstructNode tree + SynthContext (DAG), NOT a Protobuf plan. The plan-compiler (built separately) takes this tree and produces the Protobuf.

**Rationale:** In FlinkReactor, `synthesizeApp()` does everything: tree building, validation, SQL generation, CRD generation. For Isotope, we separate concerns: the DSL package handles tree construction and validation; the plan-compiler (in the same package but a separate module) handles Protobuf serialization. This makes the DSL package testable independently.

## Risks / Trade-offs

- **ConstructNode tree may encode SQL assumptions** — Some components (Query, RawSQL, joins) build trees optimized for SQL generation patterns (VirtualRef, sibling-chaining). If these patterns don't translate cleanly to Protobuf plan compilation, we may need to refactor the tree model. Mitigation: port first, refactor if the plan-compiler hits issues.
- **Removing changelog mode breaks future CDC support** — We're removing `inferChangelogMode()` and CDC format detection. When Phase 2 adds stateful operators that need changelog semantics, we'll need to re-add this. Mitigation: keep the `ChangelogMode` type in the type system but always set it to APPEND_ONLY.
- **Test snapshots won't transfer** — FlinkReactor tests use SQL snapshot assertions. Isotope tests need new snapshots based on ConstructNode tree output. All tests must be rewritten.

## Open Questions

- Should we keep the `Stream<T>` branded type for type-safe column references, or simplify to untyped column names? Keeping it adds TypeScript complexity but gives better IDE autocompletion.
- Should `synthesizeApp()` remain in the DSL package, or move to the CLI? It's the main entry point for compilation but also useful for testing.
