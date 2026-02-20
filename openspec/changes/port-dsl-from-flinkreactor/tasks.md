## 1. Package Initialization

- [x] 1.1 Initialize `packages/dsl/` with `package.json` (`@isotope/dsl`), `tsconfig.json`, build tooling (tsup), vitest config
- [x] 1.2 Configure JSX runtime entry point: `packages/dsl/src/jsx-runtime.ts` exporting `jsx`, `jsxs`, `Fragment`
- [x] 1.3 Set up package exports: main (`./dist/index.js`), jsx-runtime (`./dist/jsx-runtime.js`), types

## 2. Core Types (from FlinkReactor `src/core/types.ts`)

- [x] 2.1 Port `ConstructNode`, `NodeKind`, `TypedConstructNode`, `BaseComponentProps` — direct copy with no Flink references
- [x] 2.2 Define `ArrowType` enum replacing `FlinkType`: ARROW_INT8, ARROW_INT16, ARROW_INT32, ARROW_INT64, ARROW_FLOAT32, ARROW_FLOAT64, ARROW_STRING, ARROW_BINARY, ARROW_BOOLEAN, ARROW_TIMESTAMP_MS, ARROW_TIMESTAMP_US, ARROW_DATE32, ARROW_DECIMAL128, ARROW_LIST, ARROW_MAP, ARROW_STRUCT
- [x] 2.3 Port `Stream<T>` branded type and `createStream()` factory
- [x] 2.4 Port `ChangelogMode` type (keep as APPEND_ONLY | RETRACT | UPSERT for future compatibility)
- [x] 2.5 Write unit tests for core types

## 3. Schema System (from FlinkReactor `src/core/schema.ts`)

- [x] 3.1 Port `Schema()` factory with field validation — replace `isValidFlinkType()` with Arrow type validation
- [x] 3.2 Port `Field` builder object: all primitive builders (BOOLEAN, TINYINT, SMALLINT, INT, BIGINT, FLOAT, DOUBLE, STRING, DATE, TIME, BYTES) mapped to ArrowType values
- [x] 3.3 Port `Field` parameterized builders: DECIMAL(p,s), TIMESTAMP(p), TIMESTAMP_LTZ(p), VARCHAR(len), CHAR(len) — map TIMESTAMP(3)→ARROW_TIMESTAMP_MS, TIMESTAMP(6)→ARROW_TIMESTAMP_US
- [x] 3.4 Port `Field` composite builders: ARRAY(type), MAP(keyType, valueType), ROW(fields) — map to ARROW_LIST, ARROW_MAP, ARROW_STRUCT
- [x] 3.5 Port `SchemaDefinition<T>`, `WatermarkDeclaration`, `PrimaryKeyDeclaration` — remove `MetadataColumnDeclaration`
- [x] 3.6 Port watermark/primaryKey validation logic from Schema() factory
- [x] 3.7 Write unit tests for schema system (valid schemas, invalid field types, missing watermark columns, etc.)

## 4. JSX Runtime (from FlinkReactor `src/core/jsx-runtime.ts`)

- [x] 4.1 Port `createElement()`: function delegation, string component handling, child flattening, props cleaning
- [x] 4.2 Port node ID generation: auto-increment, _nameHint, toSqlIdentifier(), deduplication
- [x] 4.3 Update `BUILTIN_KINDS` map: add GeneratorSource, ConsoleSink; remove PaimonSink, IcebergSink, GenericSink, GenericSource, CatalogSource, PaimonCatalog, IcebergCatalog, HiveCatalog, JdbcCatalog, GenericCatalog, JdbcSource, JdbcSink, FileSystemSink
- [x] 4.4 Port `Fragment`, `jsx`, `jsxs` (automatic JSX transform), `resetNodeIdCounter()`, `registerComponentKinds()`, `resetComponentKinds()`
- [x] 4.5 Port JSX type declarations: `JSX.Element = ConstructNode`, `JSX.IntrinsicElements = {}`
- [x] 4.6 Write unit tests for JSX runtime (createElement, ID generation, kind resolution, Fragment)

## 5. Tree Utilities (from FlinkReactor `src/core/tree-utils.ts` — 100% reuse)

- [x] 5.1 Copy `mapTree`, `walkTree`, `findNodes`, `wrapNode`, `replaceChild` directly from FlinkReactor
- [x] 5.2 Write unit tests (or port existing FlinkReactor tests)

## 6. SynthContext (from FlinkReactor `src/core/synth-context.ts`)

- [x] 6.1 Port `SynthContext` class: `addNode`, `addEdge`, `getNode`, `getOutgoing`, `getIncoming`, `getNodesByKind`, `getAllNodes`, `getAllEdges`
- [x] 6.2 Port `buildFromTree(root)`: recursive tree walking, edge creation
- [x] 6.3 Port `topologicalSort()`: Kahn's algorithm with cycle error
- [x] 6.4 Port `validate()` and validation methods: `detectOrphanSources()`, `detectDanglingSinks()`, `detectCycles()` — remove `detectChangelogMismatch()`
- [x] 6.5 Port `ValidationDiagnostic` type and severity levels
- [x] 6.6 Write unit tests for SynthContext (DAG building, topological sort, cycle detection, validation)

## 7. Plugin System (from FlinkReactor `src/core/plugin.ts`, `plugin-registry.ts`)

- [x] 7.1 Port `FlinkReactorPlugin` interface → `IsotopePlugin`: keep component registration, tree transformers, validation, lifecycle hooks. Replace `PluginSqlGenerator`/`PluginDdlGenerator` with `PluginPlanTransformer`
- [x] 7.2 Port `resolvePlugins()`: topological ordering, uniqueness validation
- [x] 7.3 Port `EMPTY_PLUGIN_CHAIN` and `ResolvedPluginChain`
- [x] 7.4 Write unit tests for plugin system

## 8. Config & Environment (from FlinkReactor `src/core/config.ts`, `environment.ts`)

- [x] 8.1 Port `defineConfig()` → `IsotopeConfig` with fields: `kafka.bootstrapServers`, `runtime.batchSize`, `runtime.duckdb`, `plugins`, `kubernetes` (for future)
- [x] 8.2 Port `defineEnvironment()`, `resolveEnvironment()`, `discoverEnvironments()` — replace Flink fields with Isotope equivalents
- [x] 8.3 Port config cascade logic for multi-pipeline overrides
- [x] 8.4 Write unit tests for config/environment

## 9. Components — Sources (from FlinkReactor `src/components/sources.ts`)

- [x] 9.1 Port `KafkaSource<T>`: keep topic, bootstrapServers, schema, watermark, startupMode, consumerGroup. Remove CDC formats, inferChangelogMode(). Add format as 'json'|'csv' only.
- [x] 9.2 Implement `GeneratorSource<T>`: name, schema, rowsPerSecond, maxRows — new component (not in FlinkReactor)
- [x] 9.3 Write unit tests for source components

## 10. Components — Sinks (from FlinkReactor `src/components/sinks.ts`)

- [x] 10.1 Port `KafkaSink`: keep topic, bootstrapServers, format. Add keyBy. Remove Flink-specific format options.
- [x] 10.2 Implement `ConsoleSink`: name, maxRows — new component (not in FlinkReactor)
- [x] 10.3 Write unit tests for sink components

## 11. Components — Transforms (from FlinkReactor `src/components/transforms.ts`)

- [x] 11.1 Port `Filter` — 100% API reuse
- [x] 11.2 Port `Map` — 100% API reuse
- [x] 11.3 Port `FlatMap` — 100% API reuse
- [x] 11.4 Port `Aggregate` — 100% API reuse
- [x] 11.5 Port `Union` with `validateUnionSchemas()` — 100% API reuse
- [x] 11.6 Port `Deduplicate` — keep API, note runtime deferred to Phase 2
- [x] 11.7 Port `TopN` — keep API, note runtime deferred to Phase 2
- [x] 11.8 Write unit tests for all transform components

## 12. Components — Field Transforms (from FlinkReactor `src/components/field-transforms.ts`)

- [x] 12.1 Port `Rename` — 100% API reuse
- [x] 12.2 Port `Drop` — 100% API reuse
- [x] 12.3 Port `Cast` — remove `safe` prop (TRY_CAST is Flink-specific), adapt type references to ArrowType
- [x] 12.4 Port `Coalesce` — 100% API reuse
- [x] 12.5 Port `AddField` — 100% API reuse
- [x] 12.6 Write unit tests for field transform components

## 13. Components — Route, Joins, Windows, CEP (from FlinkReactor)

- [x] 13.1 Port `Route`, `Route.Branch`, `Route.Default` — 100% reuse from `src/components/route.ts`
- [x] 13.2 Port `Join` — remove `hints.broadcast`, keep `left`, `right`, `on`, `type`, `stateTtl`
- [x] 13.3 Port `IntervalJoin` — 100% API reuse
- [x] 13.4 Port `TemporalJoin` — 100% API reuse
- [x] 13.5 Port `LookupJoin` — 100% API reuse
- [x] 13.6 Port `TumbleWindow`, `SlideWindow`, `SessionWindow` — 100% API reuse
- [x] 13.7 Port `RawSQL` — keep as-is (SQL strings used by Isotope runtime too)
- [x] 13.8 Port `MatchRecognize` — 100% API reuse
- [x] 13.9 Port `Query` sub-components (Select, Where, GroupBy, Having) — remove window function specifics
- [x] 13.10 Write unit tests for route, join, window, and CEP components

## 14. App Synthesis (from FlinkReactor `src/core/app.ts`)

- [x] 14.1 Port `synthesizeApp()` — strip SQL/CRD generation, output validated ConstructNode tree + SynthContext
- [x] 14.2 Port config cascade: per-pipeline > env override > project config > defaults
- [x] 14.3 Port plugin integration: resolvePlugins, registerComponentKinds, beforeSynth/afterSynth hooks, tree transformers
- [x] 14.4 Port multi-pipeline support (FlinkReactorAppProps → IsotopeAppProps)
- [x] 14.5 Write unit tests for app synthesis

## 15. Testing Utilities (from FlinkReactor `src/testing/`)

- [x] 15.1 Port `synth()` helper — adapt for Isotope synthesis (outputs ConstructNode tree, not SQL)
- [x] 15.2 Port `validate()` helper — simplify for Isotope validation
- [x] 15.3 Write tests for testing utilities

## 16. Public API & Exports

- [x] 16.1 Create `packages/dsl/src/index.ts` — export all public types, components, utilities (mirror FlinkReactor's export structure)
- [x] 16.2 Verify build produces correct dist/ output with proper ESM exports
- [x] 16.3 Run full test suite, fix any failures
