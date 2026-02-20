## ADDED Requirements

### Requirement: Core type system ported from FlinkReactor
The DSL SHALL define core types in `packages/dsl/src/core/types.ts` ported from FlinkReactor's `src/core/types.ts`. The types SHALL include `ConstructNode` (DAG node with id, kind, component, props, children), `NodeKind` (Pipeline, Source, Sink, Transform, Join, Window, Route, CEP), `Stream<T>` (branded type), `BaseComponentProps`, and `TypedConstructNode<C>`.

#### Scenario: ConstructNode preserves FlinkReactor structure
- **WHEN** a ConstructNode is created via createElement()
- **THEN** it SHALL have `id`, `kind`, `component`, `props`, and `children` fields matching FlinkReactor's structure

#### Scenario: ArrowType replaces FlinkType
- **WHEN** type definitions reference data types
- **THEN** they SHALL use an `ArrowType` enum (ARROW_INT64, ARROW_INT32, ARROW_FLOAT64, ARROW_STRING, ARROW_BOOLEAN, ARROW_TIMESTAMP_MS, etc.) instead of FlinkReactor's string-based `FlinkType`

### Requirement: JSX runtime ported from FlinkReactor
The DSL SHALL provide a JSX runtime in `packages/dsl/src/core/jsx-runtime.ts` that implements `createElement()`, `Fragment`, `jsx`, and `jsxs`. The `BUILTIN_KINDS` map SHALL be updated for Isotope operators (adding GeneratorSource, ConsoleSink; removing Flink-specific catalogs and connectors).

#### Scenario: createElement builds ConstructNode tree
- **WHEN** TSX components are rendered via createElement()
- **THEN** a ConstructNode tree SHALL be constructed with auto-generated IDs, proper kind resolution, and flattened children

#### Scenario: BUILTIN_KINDS includes Isotope operators
- **WHEN** the JSX runtime resolves component kinds
- **THEN** it SHALL recognize: Pipeline, KafkaSource, GeneratorSource, KafkaSink, ConsoleSink, Filter, Map, FlatMap, Aggregate, Union, Deduplicate, TopN, Route, Rename, Drop, Cast, Coalesce, AddField, Join, TemporalJoin, LookupJoin, IntervalJoin, TumbleWindow, SlideWindow, SessionWindow, RawSQL, MatchRecognize, Query, View

### Requirement: Tree utilities ported from FlinkReactor (100% reuse)
The DSL SHALL provide tree utilities in `packages/dsl/src/core/tree-utils.ts` with functions: `mapTree` (post-order visitor), `walkTree` (pre-order read-only), `findNodes` (predicate-based), `wrapNode`, `replaceChild`. These SHALL be copied directly from FlinkReactor with no modifications.

#### Scenario: mapTree transforms nodes
- **WHEN** mapTree is called with a visitor function
- **THEN** it SHALL visit nodes in post-order and return a new tree with structural sharing for unchanged nodes

### Requirement: SynthContext ported from FlinkReactor
The DSL SHALL provide `SynthContext` in `packages/dsl/src/core/synth-context.ts` with DAG construction (`addNode`, `addEdge`, `buildFromTree`), topological sort (Kahn's algorithm), cycle detection (DFS coloring), and validation. Changelog mismatch detection SHALL be removed.

#### Scenario: Topological sort detects cycles
- **WHEN** buildFromTree processes a ConstructNode tree with a cycle
- **THEN** topologicalSort() SHALL throw an error identifying the cycle

#### Scenario: Validation catches orphan sources
- **WHEN** validate() is called on a DAG with a source that has no outgoing edges
- **THEN** it SHALL return a diagnostic with severity 'error' for the orphan source

### Requirement: Config and environment ported from FlinkReactor
The DSL SHALL provide `defineConfig()` and `defineEnvironment()` in `packages/dsl/src/core/config.ts` and `environment.ts`. Config SHALL use `IsotopeConfig` replacing `FlinkReactorConfig`, with fields for runtime settings (batchSize, duckdb), Kafka settings, and plugin configuration. The config cascade pattern (pipeline > env > project > defaults) SHALL be preserved.

#### Scenario: Config validation
- **WHEN** defineConfig() is called with an invalid configuration
- **THEN** it SHALL throw a descriptive error
