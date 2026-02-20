/**
 * Plan Compiler — converts a ConstructNode tree (from JSX runtime) into a
 * serialized Protobuf ExecutionPlan that the Go runtime can load and execute.
 *
 * Flow: ConstructNode tree → SynthContext (graph) → OperatorNode[] + Edge[] → ExecutionPlan → binary
 */
import { create, toBinary } from '@bufbuild/protobuf';
import { SynthContext } from '../core/synth-context.js';
import type { ConstructNode, FieldDefinition } from '../core/types.js';
import { ArrowType as DslArrowType } from '../core/types.js';
import type { SchemaDefinition, WatermarkDeclaration, PrimaryKeyDeclaration } from '../core/schema.js';

// ── Generated protobuf schemas ──────────────────────────────────────
import {
  ExecutionPlanSchema,
  OperatorNodeSchema,
  EdgeSchema,
  OperatorType,
  ExecutionStrategy,
  ChangelogMode as PbChangelogMode,
  ShuffleStrategy,
  PipelineMode,
  type ExecutionPlan,
  type OperatorNode as PbOperatorNode,
  type Edge,
  SourceLocationSchema,
  CheckpointConfigSchema,
  StateConfigSchema,
  RestartConfigSchema,
} from '../generated/isotope/v1/plan_pb.js';

import {
  SchemaSchema,
  SchemaFieldSchema,
  WatermarkConfigSchema,
  PrimaryKeyConfigSchema,
  ArrowType as PbArrowType,
  type Schema as PbSchema,
  type SchemaField as PbSchemaField,
} from '../generated/isotope/v1/schema_pb.js';

import {
  KafkaSourceConfigSchema,
  GeneratorSourceConfigSchema,
  KafkaSinkConfigSchema,
  ConsoleSinkConfigSchema,
  FilterConfigSchema,
  MapConfigSchema,
  FlatMapConfigSchema,
  RenameConfigSchema,
  DropConfigSchema,
  CastConfigSchema,
  UnionConfigSchema,
  RouteConfigSchema,
  RouteBranchSchema,
  CoalesceConfigSchema,
  AddFieldConfigSchema,
  AggregateConfigSchema,
  DeduplicateConfigSchema,
  TopNConfigSchema,
  TumbleWindowConfigSchema,
  SlideWindowConfigSchema,
  SessionWindowConfigSchema,
  HashJoinConfigSchema,
  TemporalJoinConfigSchema,
  LookupJoinConfigSchema,
  LookupAsyncConfigSchema,
  LookupCacheConfigSchema,
  IntervalJoinConfigSchema,
  RawSQLConfigSchema,
  MatchRecognizeConfigSchema,
} from '../generated/isotope/v1/operators_pb.js';

// ── Public API ──────────────────────────────────────────────────────

export interface CompileOptions {
  /** TSX source file path for embedding source locations */
  readonly sourceFile?: string;
}

export interface CompileResult {
  /** The in-memory ExecutionPlan protobuf message */
  readonly plan: ExecutionPlan;
  /** The serialized binary protobuf */
  readonly binary: Uint8Array;
}

/**
 * Compile a ConstructNode tree into a Protobuf ExecutionPlan.
 * The tree must have a Pipeline node as root.
 */
export function compilePlan(
  tree: ConstructNode,
  options: CompileOptions = {},
): CompileResult {
  // Build the graph representation
  const ctx = new SynthContext();
  ctx.buildFromTree(tree);

  // Validate first
  const diagnostics = ctx.validate(tree);
  const errors = diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) {
    throw new Error(
      `Plan compilation failed with ${errors.length} error(s):\n` +
        errors.map((e) => `  - ${e.message}`).join('\n'),
    );
  }

  // Extract pipeline-level config from the root Pipeline node
  const pipelineName = (tree.props.name as string) ?? 'unnamed';
  const defaultParallelism = (tree.props.parallelism as number) ?? 1;
  const modeStr = (tree.props.mode as string) ?? 'streaming';

  // Build operator nodes (skip Pipeline, Route.Branch, Route.Default — they are structural)
  const allNodes = ctx.getAllNodes();
  const operators: PbOperatorNode[] = [];
  const resolvedSchemas = resolveSchemas(ctx, allNodes);

  for (const node of allNodes) {
    if (node.kind === 'Pipeline') continue;
    if (node.component === 'Route.Branch' || node.component === 'Route.Default') continue;

    const opNode = compileOperatorNode(node, resolvedSchemas, options);
    operators.push(opNode);
  }

  // Build edges with shuffle strategy
  const edges: Edge[] = [];
  for (const graphEdge of ctx.getAllEdges()) {
    const fromNode = ctx.getNode(graphEdge.from);
    const toNode = ctx.getNode(graphEdge.to);
    if (!fromNode || !toNode) continue;

    // Skip edges from/to Pipeline nodes and Route structural children
    if (fromNode.kind === 'Pipeline' || toNode.kind === 'Pipeline') continue;
    if (fromNode.component === 'Route.Branch' || fromNode.component === 'Route.Default') continue;
    if (toNode.component === 'Route.Branch' || toNode.component === 'Route.Default') continue;

    const shuffle = assignShuffleStrategy(fromNode, toNode);
    const partitionKeys = extractPartitionKeys(fromNode, toNode);

    edges.push(create(EdgeSchema, {
      fromOperator: graphEdge.from,
      toOperator: graphEdge.to,
      shuffle,
      partitionKeys,
    }));
  }

  // Also emit edges for Route branches: Route → children of Route.Branch
  for (const node of allNodes) {
    if (node.component === 'Route') {
      emitRouteEdges(node, ctx, edges);
    }
  }

  // Build the ExecutionPlan
  const plan = create(ExecutionPlanSchema, {
    pipelineName,
    defaultParallelism,
    mode: modeStr === 'batch' ? PipelineMode.BATCH : PipelineMode.STREAMING,
    operators,
    edges,
  });

  // Add optional pipeline configs
  const checkpoint = tree.props.checkpoint as { interval: string; mode?: string } | undefined;
  if (checkpoint) {
    plan.checkpoint = create(CheckpointConfigSchema, {
      interval: checkpoint.interval,
      mode: checkpoint.mode ?? 'exactly-once',
    });
  }

  const stateBackend = tree.props.stateBackend as string | undefined;
  const stateTtl = tree.props.stateTtl as string | undefined;
  if (stateBackend || stateTtl) {
    plan.state = create(StateConfigSchema, {
      backend: stateBackend ?? '',
      ttl: stateTtl ?? '',
    });
  }

  const restartStrategy = tree.props.restartStrategy as { type: string; attempts?: number; delay?: string } | undefined;
  if (restartStrategy) {
    plan.restart = create(RestartConfigSchema, {
      type: restartStrategy.type,
      attempts: restartStrategy.attempts ?? 0,
      delay: restartStrategy.delay ?? '',
    });
  }

  const binary = toBinary(ExecutionPlanSchema, plan);
  return { plan, binary };
}

// ── Schema resolution ───────────────────────────────────────────────

type SchemaMap = Map<string, PbSchema>;

/**
 * Resolve schemas for all operator nodes by propagating from sources
 * through the DAG. Sources have explicit schemas; transforms inherit
 * or modify their input schemas.
 */
function resolveSchemas(ctx: SynthContext, allNodes: ConstructNode[]): SchemaMap {
  const schemas: SchemaMap = new Map();

  // First pass: resolve schemas from sources that have explicit schemas
  for (const node of allNodes) {
    const schemaDef = node.props.schema as SchemaDefinition | undefined;
    if (schemaDef) {
      schemas.set(node.id, convertSchema(schemaDef));
    }
  }

  // Topological sort to propagate schemas forward
  const sorted = ctx.topologicalSort();
  for (const node of sorted) {
    if (schemas.has(node.id)) continue;
    if (node.kind === 'Pipeline') continue;
    if (node.component === 'Route.Branch' || node.component === 'Route.Default') continue;

    // Get input schema from predecessors
    const incoming = ctx.getIncoming(node.id);
    let inputSchema: PbSchema | undefined;
    for (const parentId of incoming) {
      const parentNode = ctx.getNode(parentId);
      if (parentNode?.kind === 'Pipeline') continue;
      if (parentNode?.component === 'Route.Branch' || parentNode?.component === 'Route.Default') continue;
      // For Route.Branch children, look up from the Route's parent
      if (parentNode?.component === 'Route') {
        inputSchema = schemas.get(parentId);
        break;
      }
      inputSchema = schemas.get(parentId);
      if (inputSchema) break;
    }

    if (inputSchema) {
      // Derive output schema based on operator type
      const outputSchema = deriveOutputSchema(node, inputSchema);
      schemas.set(node.id, outputSchema);
    }
  }

  return schemas;
}

/** Convert a DSL SchemaDefinition to a protobuf Schema */
function convertSchema(def: SchemaDefinition): PbSchema {
  const fields: PbSchemaField[] = [];
  for (const [name, field] of Object.entries(def.fields)) {
    fields.push(convertSchemaField(name, field));
  }

  const schema = create(SchemaSchema, { fields });

  if (def.watermark) {
    schema.watermark = create(WatermarkConfigSchema, {
      column: def.watermark.column,
      expression: def.watermark.expression,
    });
  }

  if (def.primaryKey) {
    schema.primaryKey = create(PrimaryKeyConfigSchema, {
      columns: [...def.primaryKey.columns],
    });
  }

  return schema;
}

/** Convert a DSL FieldDefinition to a protobuf SchemaField */
function convertSchemaField(name: string, field: FieldDefinition): PbSchemaField {
  return create(SchemaFieldSchema, {
    name,
    flinkType: field.type,
    arrowType: mapArrowType(field.arrowType),
    nullable: true,
  });
}

/** Map DSL ArrowType string enum → protobuf ArrowType numeric enum */
function mapArrowType(dslType: string): PbArrowType {
  switch (dslType) {
    case DslArrowType.ARROW_INT8: return PbArrowType.INT8;
    case DslArrowType.ARROW_INT16: return PbArrowType.INT16;
    case DslArrowType.ARROW_INT32: return PbArrowType.INT32;
    case DslArrowType.ARROW_INT64: return PbArrowType.INT64;
    case DslArrowType.ARROW_FLOAT32: return PbArrowType.FLOAT32;
    case DslArrowType.ARROW_FLOAT64: return PbArrowType.FLOAT64;
    case DslArrowType.ARROW_STRING: return PbArrowType.STRING;
    case DslArrowType.ARROW_BINARY: return PbArrowType.BINARY;
    case DslArrowType.ARROW_BOOLEAN: return PbArrowType.BOOLEAN;
    case DslArrowType.ARROW_TIMESTAMP_MS: return PbArrowType.TIMESTAMP_MS;
    case DslArrowType.ARROW_TIMESTAMP_US: return PbArrowType.TIMESTAMP_US;
    case DslArrowType.ARROW_DATE32: return PbArrowType.DATE32;
    case DslArrowType.ARROW_DECIMAL128: return PbArrowType.DECIMAL128;
    case DslArrowType.ARROW_LIST: return PbArrowType.LIST;
    case DslArrowType.ARROW_MAP: return PbArrowType.MAP;
    case DslArrowType.ARROW_STRUCT: return PbArrowType.STRUCT;
    default: return PbArrowType.UNSPECIFIED;
  }
}

/** Derive the output schema for an operator given its input schema */
function deriveOutputSchema(node: ConstructNode, inputSchema: PbSchema): PbSchema {
  switch (node.component) {
    case 'Filter':
      // Filter doesn't change schema
      return inputSchema;

    case 'Map': {
      // Map replaces columns entirely — output is the new select columns
      const selectMap = node.props.select as Record<string, string> | undefined;
      if (!selectMap) return inputSchema;
      const fields: PbSchemaField[] = Object.keys(selectMap).map((name) =>
        create(SchemaFieldSchema, { name, flinkType: 'STRING', arrowType: PbArrowType.STRING, nullable: true }),
      );
      return create(SchemaSchema, { fields });
    }

    case 'Rename': {
      const renameMap = node.props.columns as Record<string, string> | undefined;
      if (!renameMap) return inputSchema;
      const fields = inputSchema.fields.map((f) => {
        const newName = renameMap[f.name];
        if (newName) {
          return create(SchemaFieldSchema, { ...f, name: newName });
        }
        return f;
      });
      return create(SchemaSchema, { fields });
    }

    case 'Drop': {
      const dropCols = new Set(node.props.columns as string[] | undefined);
      const fields = inputSchema.fields.filter((f) => !dropCols.has(f.name));
      return create(SchemaSchema, { fields });
    }

    case 'AddField': {
      const addMap = node.props.columns as Record<string, string> | undefined;
      if (!addMap) return inputSchema;
      const fields = [...inputSchema.fields];
      for (const name of Object.keys(addMap)) {
        fields.push(create(SchemaFieldSchema, { name, flinkType: 'STRING', arrowType: PbArrowType.STRING, nullable: true }));
      }
      return create(SchemaSchema, { fields });
    }

    default:
      // For operators we can't derive schema for, pass through input
      return inputSchema;
  }
}

// ── Operator compilation ────────────────────────────────────────────

function compileOperatorNode(
  node: ConstructNode,
  schemas: SchemaMap,
  options: CompileOptions,
): PbOperatorNode {
  const parallelism = (node.props.parallelism as number) ?? 0;
  const nameHint = (node.props._nameHint as string) ?? node.component;
  const schema = schemas.get(node.id);

  const opNode = create(OperatorNodeSchema, {
    id: node.id,
    operatorType: mapOperatorType(node.component),
    name: nameHint,
    parallelism,
    executionStrategy: assignExecutionStrategy(node),
    changelogMode: PbChangelogMode.APPEND_ONLY,
  });

  // Set schemas
  if (schema) {
    opNode.outputSchema = schema;
    // Input schema = output schema for most operators
    opNode.inputSchema = schema;
  }

  // Source location
  if (options.sourceFile) {
    opNode.sourceLocation = create(SourceLocationSchema, {
      file: options.sourceFile,
      line: 0,
      column: 0,
    });
  }

  // Set operator-specific config
  opNode.config = buildOperatorConfig(node);

  return opNode;
}

/** Map component name → OperatorType enum */
function mapOperatorType(component: string): OperatorType {
  switch (component) {
    case 'KafkaSource': return OperatorType.KAFKA_SOURCE;
    case 'GeneratorSource': return OperatorType.GENERATOR_SOURCE;
    case 'KafkaSink': return OperatorType.KAFKA_SINK;
    case 'ConsoleSink': return OperatorType.CONSOLE_SINK;
    case 'Filter': return OperatorType.FILTER;
    case 'Map': return OperatorType.MAP;
    case 'FlatMap': return OperatorType.FLAT_MAP;
    case 'Rename': return OperatorType.RENAME;
    case 'Drop': return OperatorType.DROP;
    case 'Cast': return OperatorType.CAST;
    case 'Union': return OperatorType.UNION;
    case 'Route': return OperatorType.ROUTE;
    case 'Coalesce': return OperatorType.COALESCE;
    case 'AddField': return OperatorType.ADD_FIELD;
    case 'Aggregate': return OperatorType.AGGREGATE;
    case 'Deduplicate': return OperatorType.DEDUPLICATE;
    case 'TopN': return OperatorType.TOP_N;
    case 'TumbleWindow': return OperatorType.TUMBLE_WINDOW;
    case 'SlideWindow': return OperatorType.SLIDE_WINDOW;
    case 'SessionWindow': return OperatorType.SESSION_WINDOW;
    case 'Join': return OperatorType.HASH_JOIN;
    case 'TemporalJoin': return OperatorType.TEMPORAL_JOIN;
    case 'LookupJoin': return OperatorType.LOOKUP_JOIN;
    case 'IntervalJoin': return OperatorType.INTERVAL_JOIN;
    case 'RawSQL': return OperatorType.RAW_SQL;
    case 'MatchRecognize': return OperatorType.MATCH_RECOGNIZE;
    default: return OperatorType.UNSPECIFIED;
  }
}

/** Build the oneof config for an operator from its props */
function buildOperatorConfig(node: ConstructNode): PbOperatorNode['config'] {
  const p = node.props;

  switch (node.component) {
    case 'KafkaSource': {
      const schemaDef = p.schema as SchemaDefinition | undefined;
      return {
        case: 'kafkaSource' as const,
        value: create(KafkaSourceConfigSchema, {
          topic: (p.topic as string) ?? '',
          bootstrapServers: (p.bootstrapServers as string) ?? '',
          format: (p.format as string) ?? 'json',
          schema: schemaDef ? convertSchema(schemaDef) : undefined,
          startupMode: (p.startupMode as string) ?? 'latest-offset',
          consumerGroup: (p.consumerGroup as string) ?? '',
        }),
      };
    }

    case 'GeneratorSource': {
      const schemaDef = p.schema as SchemaDefinition | undefined;
      return {
        case: 'generatorSource' as const,
        value: create(GeneratorSourceConfigSchema, {
          schema: schemaDef ? convertSchema(schemaDef) : undefined,
          rowsPerSecond: BigInt((p.rowsPerSecond as number) ?? 1000),
          maxRows: BigInt((p.maxRows as number) ?? 0),
        }),
      };
    }

    case 'KafkaSink':
      return {
        case: 'kafkaSink' as const,
        value: create(KafkaSinkConfigSchema, {
          topic: (p.topic as string) ?? '',
          bootstrapServers: (p.bootstrapServers as string) ?? '',
          format: (p.format as string) ?? 'json',
          keyBy: (p.keyBy as string[]) ?? [],
        }),
      };

    case 'ConsoleSink':
      return {
        case: 'consoleSink' as const,
        value: create(ConsoleSinkConfigSchema, {
          maxRows: (p.maxRows as number) ?? 0,
        }),
      };

    case 'Filter':
      return {
        case: 'filter' as const,
        value: create(FilterConfigSchema, {
          conditionSql: (p.condition as string) ?? '',
        }),
      };

    case 'Map':
      return {
        case: 'map' as const,
        value: create(MapConfigSchema, {
          columns: (p.select as Record<string, string>) ?? {},
        }),
      };

    case 'FlatMap': {
      const asDef = p.as as Record<string, FieldDefinition> | undefined;
      const outputFields: PbSchemaField[] = [];
      if (asDef) {
        for (const [name, field] of Object.entries(asDef)) {
          outputFields.push(convertSchemaField(name, field));
        }
      }
      return {
        case: 'flatMap' as const,
        value: create(FlatMapConfigSchema, {
          unnestColumn: (p.unnest as string) ?? '',
          outputFields,
        }),
      };
    }

    case 'Rename':
      return {
        case: 'rename' as const,
        value: create(RenameConfigSchema, {
          columns: (p.columns as Record<string, string>) ?? {},
        }),
      };

    case 'Drop':
      return {
        case: 'drop' as const,
        value: create(DropConfigSchema, {
          columns: [...((p.columns as string[]) ?? [])],
        }),
      };

    case 'Cast': {
      const castCols = p.columns as Record<string, FieldDefinition> | undefined;
      const columns: { [key: string]: PbSchemaField } = {};
      if (castCols) {
        for (const [name, field] of Object.entries(castCols)) {
          columns[name] = convertSchemaField(name, field);
        }
      }
      return {
        case: 'cast' as const,
        value: create(CastConfigSchema, { columns }),
      };
    }

    case 'Union':
      return {
        case: 'union' as const,
        value: create(UnionConfigSchema, {}),
      };

    case 'Route': {
      const branches: ReturnType<typeof create<typeof RouteBranchSchema>>[] = [];
      let defaultOperator = '';

      // Route's children are Route.Branch and Route.Default nodes
      for (const child of node.children) {
        if (child.component === 'Route.Branch') {
          const condition = (child.props.condition as string) ?? '';
          // The branch's first child is the target operator
          const target = child.children[0];
          branches.push(create(RouteBranchSchema, {
            conditionSql: condition,
            targetOperator: target?.id ?? '',
          }));
        } else if (child.component === 'Route.Default') {
          const target = child.children[0];
          defaultOperator = target?.id ?? '';
        }
      }

      return {
        case: 'route' as const,
        value: create(RouteConfigSchema, { branches, defaultOperator }),
      };
    }

    case 'Coalesce':
      return {
        case: 'coalesce' as const,
        value: create(CoalesceConfigSchema, {
          columns: (p.columns as Record<string, string>) ?? {},
        }),
      };

    case 'AddField': {
      const typesDef = p.types as Record<string, FieldDefinition> | undefined;
      const types: { [key: string]: PbSchemaField } = {};
      if (typesDef) {
        for (const [name, field] of Object.entries(typesDef)) {
          types[name] = convertSchemaField(name, field);
        }
      }
      return {
        case: 'addField' as const,
        value: create(AddFieldConfigSchema, {
          columns: (p.columns as Record<string, string>) ?? {},
          types,
        }),
      };
    }

    case 'Aggregate':
      return {
        case: 'aggregate' as const,
        value: create(AggregateConfigSchema, {
          groupBy: [...((p.groupBy as string[]) ?? [])],
          select: (p.select as Record<string, string>) ?? {},
        }),
      };

    case 'Deduplicate':
      return {
        case: 'deduplicate' as const,
        value: create(DeduplicateConfigSchema, {
          key: [...((p.key as string[]) ?? [])],
          order: (p.order as string) ?? '',
          keep: (p.keep as string) ?? 'first',
        }),
      };

    case 'TopN':
      return {
        case: 'topN' as const,
        value: create(TopNConfigSchema, {
          partitionBy: [...((p.partitionBy as string[]) ?? [])],
          orderBy: (p.orderBy as Record<string, string>) ?? {},
          n: (p.n as number) ?? 10,
        }),
      };

    case 'TumbleWindow':
      return {
        case: 'tumbleWindow' as const,
        value: create(TumbleWindowConfigSchema, {
          size: (p.size as string) ?? '',
          timeColumn: (p.on as string) ?? '',
        }),
      };

    case 'SlideWindow':
      return {
        case: 'slideWindow' as const,
        value: create(SlideWindowConfigSchema, {
          size: (p.size as string) ?? '',
          slide: (p.slide as string) ?? '',
          timeColumn: (p.on as string) ?? '',
        }),
      };

    case 'SessionWindow':
      return {
        case: 'sessionWindow' as const,
        value: create(SessionWindowConfigSchema, {
          gap: (p.gap as string) ?? '',
          timeColumn: (p.on as string) ?? '',
        }),
      };

    case 'Join':
      return {
        case: 'hashJoin' as const,
        value: create(HashJoinConfigSchema, {
          conditionSql: (p.on as string) ?? '',
          joinType: (p.type as string) ?? 'inner',
          stateTtl: (p.stateTtl as string) ?? '',
        }),
      };

    case 'TemporalJoin':
      return {
        case: 'temporalJoin' as const,
        value: create(TemporalJoinConfigSchema, {
          conditionSql: (p.on as string) ?? '',
          asOf: (p.asOf as string) ?? '',
        }),
      };

    case 'LookupJoin': {
      const asyncCfg = p.async as { enabled: boolean; capacity?: number; timeout?: string } | undefined;
      const cacheCfg = p.cache as { type: string; maxRows: number; ttl: string } | undefined;

      return {
        case: 'lookupJoin' as const,
        value: create(LookupJoinConfigSchema, {
          table: (p.table as string) ?? '',
          url: (p.url as string) ?? '',
          conditionSql: (p.on as string) ?? '',
          select: (p.select as Record<string, string>) ?? {},
          async: asyncCfg ? create(LookupAsyncConfigSchema, {
            enabled: asyncCfg.enabled,
            capacity: asyncCfg.capacity ?? 0,
            timeout: asyncCfg.timeout ?? '',
          }) : undefined,
          cache: cacheCfg ? create(LookupCacheConfigSchema, {
            type: cacheCfg.type,
            maxRows: BigInt(cacheCfg.maxRows),
            ttl: cacheCfg.ttl,
          }) : undefined,
        }),
      };
    }

    case 'IntervalJoin': {
      const interval = p.interval as { from: string; to: string } | undefined;
      return {
        case: 'intervalJoin' as const,
        value: create(IntervalJoinConfigSchema, {
          conditionSql: (p.on as string) ?? '',
          intervalFrom: interval?.from ?? '',
          intervalTo: interval?.to ?? '',
          joinType: (p.type as string) ?? 'inner',
        }),
      };
    }

    case 'RawSQL':
      return {
        case: 'rawSql' as const,
        value: create(RawSQLConfigSchema, {
          sql: (p.sql as string) ?? '',
        }),
      };

    case 'MatchRecognize': {
      const orderByStr = p.orderBy as string | undefined;
      const orderByMap: Record<string, string> = {};
      if (orderByStr) {
        // Parse simple "col ASC" or "col DESC" format
        orderByMap[orderByStr.split(/\s+/)[0]] = orderByStr.includes('DESC') ? 'DESC' : 'ASC';
      }
      return {
        case: 'matchRecognize' as const,
        value: create(MatchRecognizeConfigSchema, {
          partitionBy: [...((p.partitionBy as string[]) ?? [])],
          orderBy: orderByMap,
          pattern: (p.pattern as string) ?? '',
          define: (p.define as Record<string, string>) ?? {},
          measures: (p.measures as Record<string, string>) ?? {},
          afterMatch: (p.after as string) ?? '',
        }),
      };
    }

    default:
      return { case: undefined, value: undefined };
  }
}

// ── Shuffle strategy ────────────────────────────────────────────────

/** Assign FORWARD/HASH/BROADCAST based on operator semantics */
function assignShuffleStrategy(from: ConstructNode, to: ConstructNode): ShuffleStrategy {
  // Joins need HASH shuffle for the join key
  if (to.component === 'Join' || to.component === 'IntervalJoin') {
    return ShuffleStrategy.HASH;
  }

  // Aggregates need HASH shuffle for the group-by key
  if (to.component === 'Aggregate') {
    return ShuffleStrategy.HASH;
  }

  // Windows need HASH shuffle (partitioned by time column)
  if (to.component === 'TumbleWindow' || to.component === 'SlideWindow' || to.component === 'SessionWindow') {
    return ShuffleStrategy.HASH;
  }

  // TopN needs HASH for partitionBy
  if (to.component === 'TopN') {
    return ShuffleStrategy.HASH;
  }

  // Deduplicate needs HASH for the dedup key
  if (to.component === 'Deduplicate') {
    return ShuffleStrategy.HASH;
  }

  // Temporal join: stream input is HASH, temporal side is BROADCAST
  if (to.component === 'TemporalJoin') {
    // The temporal table side gets BROADCAST
    if (from.id === (to.props.temporal as string)) {
      return ShuffleStrategy.BROADCAST;
    }
    return ShuffleStrategy.HASH;
  }

  // Lookup join is FORWARD (each instance queries independently)
  if (to.component === 'LookupJoin') {
    return ShuffleStrategy.FORWARD;
  }

  // Everything else: FORWARD (stateless operators, sinks)
  return ShuffleStrategy.FORWARD;
}

/** Extract partition keys from edge context */
function extractPartitionKeys(from: ConstructNode, to: ConstructNode): string[] {
  if (to.component === 'Aggregate') {
    return [...((to.props.groupBy as string[]) ?? [])];
  }
  if (to.component === 'Deduplicate') {
    return [...((to.props.key as string[]) ?? [])];
  }
  if (to.component === 'TopN') {
    return [...((to.props.partitionBy as string[]) ?? [])];
  }
  return [];
}

// ── Execution strategy ──────────────────────────────────────────────

/** Assign ARROW_NATIVE or DUCKDB_MICRO_BATCH based on operator type */
function assignExecutionStrategy(node: ConstructNode): ExecutionStrategy {
  // Windowed SQL operators use DuckDB
  switch (node.component) {
    case 'TumbleWindow':
    case 'SlideWindow':
    case 'SessionWindow':
    case 'Aggregate':
    case 'RawSQL':
      return ExecutionStrategy.DUCKDB_MICRO_BATCH;
    default:
      return ExecutionStrategy.ARROW_NATIVE;
  }
}

// ── Route edge emission ─────────────────────────────────────────────

/**
 * For Route operators, we need to emit edges from the Route to the
 * first operator in each branch (skipping Route.Branch/Route.Default
 * structural nodes).
 */
function emitRouteEdges(routeNode: ConstructNode, ctx: SynthContext, edges: Edge[]): void {
  for (const child of routeNode.children) {
    if (child.component === 'Route.Branch' || child.component === 'Route.Default') {
      // Emit edges from Route to each of the branch's actual operator children
      for (const grandchild of child.children) {
        if (grandchild.component !== 'Route.Branch' && grandchild.component !== 'Route.Default') {
          edges.push(create(EdgeSchema, {
            fromOperator: routeNode.id,
            toOperator: grandchild.id,
            shuffle: ShuffleStrategy.FORWARD,
            partitionKeys: [],
          }));
        }
      }
    }
  }
}
