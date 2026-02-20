## Why

Isotope's TypeScript DSL is designed to share the same TSX syntax and component APIs as FlinkReactor. Rather than re-implementing ~3,500 lines of proven TypeScript from scratch, we port the existing FlinkReactor DSL — adapting it to target Protobuf ExecutionPlans instead of Flink SQL. This gives us a working DSL in days instead of weeks, with battle-tested JSX runtime, schema validation, DAG construction, and 30+ component factories already implemented.

The port is not a copy-paste — it requires systematic adaptation: replacing Flink SQL types with Arrow types, removing CDC changelog semantics, stripping Flink-specific connector options, and rewiring the synthesis pipeline to emit Protobuf instead of SQL.

## What Changes

- Initialize `packages/dsl/` as a pnpm workspace package with TypeScript build tooling
- Port core types: `ConstructNode`, `NodeKind`, `Stream`, `BaseComponentProps` — replace `FlinkType` with `ArrowType`
- Port JSX runtime: `createElement()`, `Fragment`, `jsx`/`jsxs` — update `BUILTIN_KINDS` map for Isotope operators
- Port schema system: `Schema()`, `Field` builders — map to Arrow types (Field.BIGINT() → ARROW_INT64)
- Port tree utilities: `mapTree`, `walkTree`, `findNodes`, `wrapNode`, `replaceChild` — 100% reuse
- Port SynthContext: DAG building, topological sort, cycle detection, validation — remove changelog mismatch detection
- Port plugin system: component registration, tree transformers, validation hooks — replace SQL/DDL generators with plan transformers
- Port config/environment: `defineConfig()`, `defineEnvironment()`, config cascade — adapt for Isotope settings
- Port components: Pipeline, KafkaSource, Filter, Map, FlatMap, Aggregate, Union, Route, Rename, Drop, Cast, Coalesce, AddField, joins, windows, MatchRecognize — remove Flink-specific props, add Isotope-specific ones (GeneratorSource, ConsoleSink)
- Port app synthesis: `synthesizeApp()` — rewire output from SQL+CRD to ConstructNode tree (plan-compiler consumes this separately)
- Port testing utilities: `synth()`, `validate()` helpers
- Write unit tests for all ported modules

## Capabilities

### New Capabilities
- `isotope-dsl-core`: Core types, JSX runtime, tree utilities, and SynthContext ported from FlinkReactor with Arrow type system
- `isotope-dsl-schema`: Schema system with Field builders mapped to Arrow types instead of Flink SQL types
- `isotope-dsl-components`: All component factories (sources, sinks, transforms, joins, windows, routing, CEP) adapted for Isotope
- `isotope-dsl-plugins`: Plugin architecture for extending the DSL with custom components and transformers

### Modified Capabilities
_None — this is the initial DSL implementation._

## Impact

- **New directories**: `packages/dsl/` (full package), `packages/dsl/src/core/`, `packages/dsl/src/components/`, `packages/dsl/src/testing/`
- **New dependencies**: `@bufbuild/protobuf` (for generated types, consumed later by plan-compiler)
- **Source project**: `/Users/ahmed/Development/opensource/flink-reactor/src/` — core/, components/, testing/
- **Downstream**: `packages/cli/` (imports DSL), plan-compiler (consumes ConstructNode trees)
