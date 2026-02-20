// ── Core: types ──────────────────────────────────────────────────────
export {
  ArrowType,
  createStream,
} from './core/types.js';
export type {
  FieldDefinition,
  ChangelogMode,
  IsotopeSchema,
  Stream,
  BaseComponentProps,
  NodeKind,
  ConstructNode,
  TypedConstructNode,
} from './core/types.js';

// ── Core: schema ─────────────────────────────────────────────────────
export { Schema, Field, isValidArrowType } from './core/schema.js';
export type {
  SchemaDefinition,
  SchemaOptions,
  WatermarkDeclaration,
  PrimaryKeyDeclaration,
} from './core/schema.js';

// ── Core: JSX runtime ────────────────────────────────────────────────
export { createElement, Fragment, jsx, jsxs } from './core/jsx-runtime.js';
export { resetNodeIdCounter, registerComponentKinds, resetComponentKinds, toSqlIdentifier } from './core/jsx-runtime.js';

// ── Core: tree utilities ─────────────────────────────────────────────
export { rekindTree, mapTree, walkTree, findNodes, wrapNode, replaceChild } from './core/tree-utils.js';

// ── Core: synth context ──────────────────────────────────────────────
export { SynthContext } from './core/synth-context.js';
export type { GraphEdge, ValidationDiagnostic } from './core/synth-context.js';

// ── Core: app ────────────────────────────────────────────────────────
export { synthesizeApp } from './core/app.js';
export type { IsotopeAppProps, PipelineArtifact, AppSynthResult } from './core/app.js';

// ── Core: plugins ────────────────────────────────────────────────────
export type {
  IsotopePlugin,
  SynthHookContext,
  AfterSynthHookContext,
  PluginPlanTransformer,
  PluginValidator,
} from './core/plugin.js';
export { resolvePlugins, EMPTY_PLUGIN_CHAIN } from './core/plugin-registry.js';
export type { ResolvedPluginChain } from './core/plugin-registry.js';

// ── Core: config & environment ───────────────────────────────────────
export { defineConfig } from './core/config.js';
export type { IsotopeConfig } from './core/config.js';
export { defineEnvironment, resolveEnvironment, discoverEnvironments } from './core/environment.js';
export type { EnvironmentConfig, PipelineOverrides } from './core/environment.js';

// ── Components: pipeline ─────────────────────────────────────────────
export { Pipeline } from './components/pipeline.js';
export type { PipelineProps, PipelineMode, StateBackend, CheckpointConfig, RestartStrategy } from './components/pipeline.js';

// ── Components: sources ──────────────────────────────────────────────
export { KafkaSource, GeneratorSource } from './components/sources.js';
export type { KafkaSourceProps, GeneratorSourceProps, KafkaFormat, KafkaStartupMode } from './components/sources.js';

// ── Components: sinks ────────────────────────────────────────────────
export { KafkaSink, ConsoleSink } from './components/sinks.js';
export type { KafkaSinkProps, ConsoleSinkProps, SinkFormat } from './components/sinks.js';

// ── Components: transforms ───────────────────────────────────────────
export { Filter, Map, FlatMap, Aggregate, Union, Deduplicate, TopN } from './components/transforms.js';
export type { FilterProps, MapProps, FlatMapProps, AggregateProps, UnionProps, DeduplicateProps, TopNProps } from './components/transforms.js';

// ── Components: field transforms ─────────────────────────────────────
export { Rename, Drop, Cast, Coalesce, AddField } from './components/field-transforms.js';
export type { RenameProps, DropProps, CastProps, CoalesceProps, AddFieldProps } from './components/field-transforms.js';

// ── Components: route ────────────────────────────────────────────────
export { Route } from './components/route.js';
export type { RouteProps, RouteBranchProps, RouteDefaultProps } from './components/route.js';

// ── Components: joins ────────────────────────────────────────────────
export { Join, TemporalJoin, LookupJoin, IntervalJoin } from './components/joins.js';
export type { JoinProps, TemporalJoinProps, LookupJoinProps, IntervalJoinProps, JoinType, IntervalBounds, LookupAsyncConfig, LookupCacheConfig } from './components/joins.js';

// ── Components: windows ──────────────────────────────────────────────
export { TumbleWindow, SlideWindow, SessionWindow } from './components/windows.js';
export type { TumbleWindowProps, SlideWindowProps, SessionWindowProps } from './components/windows.js';

// ── Components: escape hatches ───────────────────────────────────────
export { RawSQL } from './components/escape-hatches.js';
export type { RawSQLProps } from './components/escape-hatches.js';

// ── Components: CEP ──────────────────────────────────────────────────
export { MatchRecognize } from './components/cep.js';
export type { MatchRecognizeProps, MatchAfterStrategy } from './components/cep.js';

// ── Components: query ────────────────────────────────────────────────
export { Query } from './components/query.js';
export type { QueryProps, QuerySelectProps, QueryWhereProps, QueryGroupByProps, QueryHavingProps, QueryOrderByProps, WindowSpec, WindowFunctionExpr, ColumnExpr } from './components/query.js';

// ── Compiler: plan-compiler ─────────────────────────────────────────
export { compilePlan } from './compiler/plan-compiler.js';
export type { CompileOptions, CompileResult } from './compiler/plan-compiler.js';
