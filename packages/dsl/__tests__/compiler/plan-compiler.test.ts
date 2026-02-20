import { describe, it, expect, beforeEach } from 'vitest';
import { fromBinary } from '@bufbuild/protobuf';
import { resetNodeIdCounter } from '../../src/core/jsx-runtime.js';
import { Schema, Field } from '../../src/core/schema.js';
import { KafkaSource, GeneratorSource } from '../../src/components/sources.js';
import { KafkaSink, ConsoleSink } from '../../src/components/sinks.js';
import { Filter, Map, FlatMap, Aggregate, Union, Deduplicate, TopN } from '../../src/components/transforms.js';
import { Rename, Drop, Cast, Coalesce, AddField } from '../../src/components/field-transforms.js';
import { Route } from '../../src/components/route.js';
import { TumbleWindow, SlideWindow, SessionWindow } from '../../src/components/windows.js';
import { Join } from '../../src/components/joins.js';
import { Pipeline } from '../../src/components/pipeline.js';
import { compilePlan } from '../../src/compiler/plan-compiler.js';
import {
  ExecutionPlanSchema,
  OperatorType,
  ExecutionStrategy,
  PipelineMode,
  ShuffleStrategy,
} from '../../src/generated/isotope/v1/plan_pb.js';
import { ArrowType } from '../../src/generated/isotope/v1/schema_pb.js';

// ── Test schema ─────────────────────────────────────────────────────

const orderSchema = Schema({
  fields: {
    id: Field.BIGINT(),
    amount: Field.DOUBLE(),
    country: Field.STRING(),
    ts: Field.TIMESTAMP(3),
  },
  watermark: {
    column: 'ts',
    expression: "ts - INTERVAL '5' SECOND",
  },
});

beforeEach(() => {
  resetNodeIdCounter();
});

// ── 8.1: Basic compilation ──────────────────────────────────────────

describe('compilePlan', () => {
  it('compiles a simple pipeline to binary protobuf', () => {
    const tree = Pipeline({
      name: 'test-pipeline',
      parallelism: 4,
      mode: 'streaming',
      children: KafkaSource({
        topic: 'orders',
        bootstrapServers: 'kafka:9092',
        schema: orderSchema,
        children: Filter({
          condition: 'amount > 100',
          children: ConsoleSink({}),
        }),
      }),
    });

    const result = compilePlan(tree);

    // Verify binary roundtrip
    expect(result.binary).toBeInstanceOf(Uint8Array);
    expect(result.binary.length).toBeGreaterThan(0);

    // Deserialize and verify
    const deserialized = fromBinary(ExecutionPlanSchema, result.binary);
    expect(deserialized.pipelineName).toBe('test-pipeline');
    expect(deserialized.defaultParallelism).toBe(4);
    expect(deserialized.mode).toBe(PipelineMode.STREAMING);
    expect(deserialized.operators.length).toBe(3); // KafkaSource, Filter, ConsoleSink
    expect(deserialized.edges.length).toBeGreaterThanOrEqual(2);
  });

  it('sets pipeline config (checkpoint, state, restart)', () => {
    const tree = Pipeline({
      name: 'configured-pipeline',
      checkpoint: { interval: '30s', mode: 'exactly-once' },
      stateBackend: 'pebble',
      stateTtl: '1h',
      restartStrategy: { type: 'fixed-delay', attempts: 3, delay: '10s' },
      children: GeneratorSource({
        schema: orderSchema,
        rowsPerSecond: 100,
        maxRows: 1000,
        children: ConsoleSink({}),
      }),
    });

    const { plan } = compilePlan(tree);
    expect(plan.checkpoint?.interval).toBe('30s');
    expect(plan.checkpoint?.mode).toBe('exactly-once');
    expect(plan.state?.backend).toBe('pebble');
    expect(plan.state?.ttl).toBe('1h');
    expect(plan.restart?.type).toBe('fixed-delay');
    expect(plan.restart?.attempts).toBe(3);
    expect(plan.restart?.delay).toBe('10s');
  });
});

// ── 8.2: Schema resolution ──────────────────────────────────────────

describe('schema resolution', () => {
  it('propagates source schema through transforms', () => {
    const tree = Pipeline({
      name: 'schema-test',
      children: KafkaSource({
        topic: 'orders',
        bootstrapServers: 'kafka:9092',
        schema: orderSchema,
        children: Filter({
          condition: 'amount > 50',
          children: ConsoleSink({}),
        }),
      }),
    });

    const { plan } = compilePlan(tree);
    const sourceOp = plan.operators.find(op => op.config.case === 'kafkaSource');
    const filterOp = plan.operators.find(op => op.config.case === 'filter');

    // Source should have schema with watermark
    expect(sourceOp?.outputSchema?.fields.length).toBe(4);
    expect(sourceOp?.outputSchema?.watermark?.column).toBe('ts');

    // Filter should inherit schema from source
    expect(filterOp?.outputSchema?.fields.length).toBe(4);
  });

  it('resolves schemas for Rename operator', () => {
    const tree = Pipeline({
      name: 'rename-test',
      children: KafkaSource({
        topic: 'orders',
        bootstrapServers: 'kafka:9092',
        schema: orderSchema,
        children: Rename({
          columns: { country: 'region' },
          children: ConsoleSink({}),
        }),
      }),
    });

    const { plan } = compilePlan(tree);
    const renameOp = plan.operators.find(op => op.config.case === 'rename');
    const renamedField = renameOp?.outputSchema?.fields.find(f => f.name === 'region');
    const originalField = renameOp?.outputSchema?.fields.find(f => f.name === 'country');
    expect(renamedField).toBeDefined();
    expect(originalField).toBeUndefined();
  });

  it('resolves schemas for Drop operator', () => {
    const tree = Pipeline({
      name: 'drop-test',
      children: KafkaSource({
        topic: 'orders',
        bootstrapServers: 'kafka:9092',
        schema: orderSchema,
        children: Drop({
          columns: ['country', 'ts'],
          children: ConsoleSink({}),
        }),
      }),
    });

    const { plan } = compilePlan(tree);
    const dropOp = plan.operators.find(op => op.config.case === 'drop');
    expect(dropOp?.outputSchema?.fields.length).toBe(2); // id and amount remain
  });
});

// ── 8.3: Shuffle planner ────────────────────────────────────────────

describe('shuffle planner', () => {
  it('assigns FORWARD for stateless operators', () => {
    const tree = Pipeline({
      name: 'forward-test',
      children: KafkaSource({
        topic: 'orders',
        bootstrapServers: 'kafka:9092',
        schema: orderSchema,
        children: Filter({
          condition: 'amount > 100',
          children: ConsoleSink({}),
        }),
      }),
    });

    const { plan } = compilePlan(tree);
    for (const edge of plan.edges) {
      expect(edge.shuffle).toBe(ShuffleStrategy.FORWARD);
    }
  });

  it('assigns HASH for Aggregate with partition keys', () => {
    const tree = Pipeline({
      name: 'agg-test',
      children: KafkaSource({
        topic: 'orders',
        bootstrapServers: 'kafka:9092',
        schema: orderSchema,
        children: Aggregate({
          groupBy: ['country'],
          select: { total: 'SUM(amount)' },
          children: ConsoleSink({}),
        }),
      }),
    });

    const { plan } = compilePlan(tree);
    const aggEdge = plan.edges.find(e => {
      const targetOp = plan.operators.find(o => o.id === e.toOperator);
      return targetOp?.config.case === 'aggregate';
    });
    expect(aggEdge?.shuffle).toBe(ShuffleStrategy.HASH);
    expect(aggEdge?.partitionKeys).toEqual(['country']);
  });

  it('assigns HASH for TumbleWindow', () => {
    const tree = Pipeline({
      name: 'window-test',
      children: KafkaSource({
        topic: 'orders',
        bootstrapServers: 'kafka:9092',
        schema: orderSchema,
        children: TumbleWindow({
          size: '5 MINUTE',
          on: 'ts',
          children: ConsoleSink({}),
        }),
      }),
    });

    const { plan } = compilePlan(tree);
    const windowEdge = plan.edges.find(e => {
      const targetOp = plan.operators.find(o => o.id === e.toOperator);
      return targetOp?.config.case === 'tumbleWindow';
    });
    expect(windowEdge?.shuffle).toBe(ShuffleStrategy.HASH);
  });
});

// ── 8.4: Execution strategy ─────────────────────────────────────────

describe('execution strategy', () => {
  it('assigns ARROW_NATIVE for stateless operators', () => {
    const tree = Pipeline({
      name: 'strategy-test',
      children: KafkaSource({
        topic: 'orders',
        bootstrapServers: 'kafka:9092',
        schema: orderSchema,
        children: Filter({
          condition: 'amount > 100',
          children: ConsoleSink({}),
        }),
      }),
    });

    const { plan } = compilePlan(tree);
    const filterOp = plan.operators.find(op => op.config.case === 'filter');
    expect(filterOp?.executionStrategy).toBe(ExecutionStrategy.ARROW_NATIVE);
  });

  it('assigns DUCKDB_MICRO_BATCH for windowed/aggregate operators', () => {
    const tree = Pipeline({
      name: 'duckdb-test',
      children: KafkaSource({
        topic: 'orders',
        bootstrapServers: 'kafka:9092',
        schema: orderSchema,
        children: TumbleWindow({
          size: '5 MINUTE',
          on: 'ts',
          children: Aggregate({
            groupBy: ['country'],
            select: { total: 'SUM(amount)' },
            children: ConsoleSink({}),
          }),
        }),
      }),
    });

    const { plan } = compilePlan(tree);
    const windowOp = plan.operators.find(op => op.config.case === 'tumbleWindow');
    const aggOp = plan.operators.find(op => op.config.case === 'aggregate');
    expect(windowOp?.executionStrategy).toBe(ExecutionStrategy.DUCKDB_MICRO_BATCH);
    expect(aggOp?.executionStrategy).toBe(ExecutionStrategy.DUCKDB_MICRO_BATCH);
  });
});

// ── 8.5: Source location ────────────────────────────────────────────

describe('source location', () => {
  it('embeds source file when provided', () => {
    const tree = Pipeline({
      name: 'location-test',
      children: GeneratorSource({
        schema: orderSchema,
        rowsPerSecond: 100,
        children: ConsoleSink({}),
      }),
    });

    const { plan } = compilePlan(tree, { sourceFile: 'pipelines/orders.tsx' });
    for (const op of plan.operators) {
      expect(op.sourceLocation?.file).toBe('pipelines/orders.tsx');
    }
  });
});

// ── 8.6: Operator config compilation ────────────────────────────────

describe('operator configs', () => {
  it('compiles KafkaSource config', () => {
    const tree = Pipeline({
      name: 'kafka-test',
      children: KafkaSource({
        topic: 'orders',
        bootstrapServers: 'kafka:9092',
        format: 'json',
        schema: orderSchema,
        startupMode: 'earliest-offset',
        consumerGroup: 'test-group',
        children: ConsoleSink({}),
      }),
    });

    const { plan } = compilePlan(tree);
    const op = plan.operators.find(o => o.config.case === 'kafkaSource');
    expect(op?.config.case).toBe('kafkaSource');
    if (op?.config.case === 'kafkaSource') {
      expect(op.config.value.topic).toBe('orders');
      expect(op.config.value.bootstrapServers).toBe('kafka:9092');
      expect(op.config.value.format).toBe('json');
      expect(op.config.value.startupMode).toBe('earliest-offset');
      expect(op.config.value.consumerGroup).toBe('test-group');
      expect(op.config.value.schema?.fields.length).toBe(4);
    }
  });

  it('compiles GeneratorSource config', () => {
    const tree = Pipeline({
      name: 'gen-test',
      children: GeneratorSource({
        schema: orderSchema,
        rowsPerSecond: 5000,
        maxRows: 10000,
        children: ConsoleSink({}),
      }),
    });

    const { plan } = compilePlan(tree);
    const op = plan.operators.find(o => o.config.case === 'generatorSource');
    if (op?.config.case === 'generatorSource') {
      expect(op.config.value.rowsPerSecond).toBe(BigInt(5000));
      expect(op.config.value.maxRows).toBe(BigInt(10000));
    }
  });

  it('compiles Filter config', () => {
    const tree = Pipeline({
      name: 'filter-test',
      children: GeneratorSource({
        schema: orderSchema,
        rowsPerSecond: 100,
        children: Filter({
          condition: "amount > 100 AND country = 'US'",
          children: ConsoleSink({}),
        }),
      }),
    });

    const { plan } = compilePlan(tree);
    const op = plan.operators.find(o => o.config.case === 'filter');
    if (op?.config.case === 'filter') {
      expect(op.config.value.conditionSql).toBe("amount > 100 AND country = 'US'");
    }
  });

  it('compiles Map config', () => {
    const tree = Pipeline({
      name: 'map-test',
      children: GeneratorSource({
        schema: orderSchema,
        rowsPerSecond: 100,
        children: Map({
          select: { id: 'id', doubled: 'amount * 2', upper_country: 'UPPER(country)' },
          children: ConsoleSink({}),
        }),
      }),
    });

    const { plan } = compilePlan(tree);
    const op = plan.operators.find(o => o.config.case === 'map');
    if (op?.config.case === 'map') {
      expect(op.config.value.columns['doubled']).toBe('amount * 2');
      expect(op.config.value.columns['upper_country']).toBe('UPPER(country)');
    }
  });

  it('compiles KafkaSink config with keyBy', () => {
    const tree = Pipeline({
      name: 'sink-test',
      children: GeneratorSource({
        schema: orderSchema,
        rowsPerSecond: 100,
        children: KafkaSink({
          topic: 'output',
          bootstrapServers: 'kafka:9092',
          format: 'json',
          keyBy: ['id', 'country'],
        }),
      }),
    });

    const { plan } = compilePlan(tree);
    const op = plan.operators.find(o => o.config.case === 'kafkaSink');
    if (op?.config.case === 'kafkaSink') {
      expect(op.config.value.topic).toBe('output');
      expect(op.config.value.keyBy).toEqual(['id', 'country']);
    }
  });

  it('compiles TumbleWindow config', () => {
    const tree = Pipeline({
      name: 'tumble-test',
      children: GeneratorSource({
        schema: orderSchema,
        rowsPerSecond: 100,
        children: TumbleWindow({
          size: '10 MINUTE',
          on: 'ts',
          children: ConsoleSink({}),
        }),
      }),
    });

    const { plan } = compilePlan(tree);
    const op = plan.operators.find(o => o.config.case === 'tumbleWindow');
    if (op?.config.case === 'tumbleWindow') {
      expect(op.config.value.size).toBe('10 MINUTE');
      expect(op.config.value.timeColumn).toBe('ts');
    }
  });

  it('compiles Route config with branches', () => {
    const tree = Pipeline({
      name: 'route-test',
      children: GeneratorSource({
        schema: orderSchema,
        rowsPerSecond: 100,
        children: Route({
          children: [
            Route.Branch({
              condition: "country = 'US'",
              children: ConsoleSink({ name: 'us_sink' }),
            }),
            Route.Branch({
              condition: "country = 'UK'",
              children: ConsoleSink({ name: 'uk_sink' }),
            }),
            Route.Default({
              children: ConsoleSink({ name: 'other_sink' }),
            }),
          ],
        }),
      }),
    });

    const { plan } = compilePlan(tree);
    const routeOp = plan.operators.find(o => o.config.case === 'route');
    if (routeOp?.config.case === 'route') {
      expect(routeOp.config.value.branches.length).toBe(2);
      expect(routeOp.config.value.branches[0].conditionSql).toBe("country = 'US'");
      expect(routeOp.config.value.branches[1].conditionSql).toBe("country = 'UK'");
      expect(routeOp.config.value.defaultOperator).toBeTruthy();
    }
  });

  it('compiles Aggregate config', () => {
    const tree = Pipeline({
      name: 'agg-config-test',
      children: GeneratorSource({
        schema: orderSchema,
        rowsPerSecond: 100,
        children: Aggregate({
          groupBy: ['country'],
          select: { total_amount: 'SUM(amount)', order_count: 'COUNT(*)' },
          children: ConsoleSink({}),
        }),
      }),
    });

    const { plan } = compilePlan(tree);
    const op = plan.operators.find(o => o.config.case === 'aggregate');
    if (op?.config.case === 'aggregate') {
      expect(op.config.value.groupBy).toEqual(['country']);
      expect(op.config.value.select['total_amount']).toBe('SUM(amount)');
      expect(op.config.value.select['order_count']).toBe('COUNT(*)');
    }
  });
});

// ── 8.7: Binary roundtrip ───────────────────────────────────────────

describe('binary roundtrip', () => {
  it('roundtrips a complex pipeline through serialize/deserialize', () => {
    const tree = Pipeline({
      name: 'roundtrip-pipeline',
      parallelism: 2,
      mode: 'streaming',
      children: KafkaSource({
        topic: 'orders',
        bootstrapServers: 'kafka:9092',
        format: 'json',
        schema: orderSchema,
        startupMode: 'earliest-offset',
        children: [
          Filter({
            condition: 'amount > 100',
            children: Map({
              select: { id: 'id', amount: 'amount', upper_country: 'UPPER(country)' },
              children: KafkaSink({
                topic: 'filtered-orders',
                bootstrapServers: 'kafka:9092',
                keyBy: ['id'],
              }),
            }),
          }),
          ConsoleSink({ maxRows: 50 }),
        ],
      }),
    });

    const { binary } = compilePlan(tree, { sourceFile: 'pipelines/orders.tsx' });

    // Deserialize from binary
    const restored = fromBinary(ExecutionPlanSchema, binary);

    expect(restored.pipelineName).toBe('roundtrip-pipeline');
    expect(restored.defaultParallelism).toBe(2);
    expect(restored.mode).toBe(PipelineMode.STREAMING);

    // Check operators are present
    const opTypes = restored.operators.map(o => o.config.case).sort();
    expect(opTypes).toContain('kafkaSource');
    expect(opTypes).toContain('filter');
    expect(opTypes).toContain('map');
    expect(opTypes).toContain('kafkaSink');
    expect(opTypes).toContain('consoleSink');

    // Check source location embedding
    for (const op of restored.operators) {
      expect(op.sourceLocation?.file).toBe('pipelines/orders.tsx');
    }

    // Check schema fields on source
    const srcOp = restored.operators.find(o => o.config.case === 'kafkaSource');
    if (srcOp?.config.case === 'kafkaSource') {
      const schema = srcOp.config.value.schema;
      expect(schema?.fields.length).toBe(4);
      const idField = schema?.fields.find(f => f.name === 'id');
      expect(idField?.arrowType).toBe(ArrowType.INT64);
      const tsField = schema?.fields.find(f => f.name === 'ts');
      expect(tsField?.arrowType).toBe(ArrowType.TIMESTAMP_MS);
    }

    // Check edges exist
    expect(restored.edges.length).toBeGreaterThanOrEqual(4);
  });
});

// ── Schema field arrow type mapping ─────────────────────────────────

describe('arrow type mapping', () => {
  it('maps all DSL arrow types to protobuf arrow types', () => {
    const schema = Schema({
      fields: {
        a: Field.BOOLEAN(),
        b: Field.TINYINT(),
        c: Field.SMALLINT(),
        d: Field.INT(),
        e: Field.BIGINT(),
        f: Field.FLOAT(),
        g: Field.DOUBLE(),
        h: Field.STRING(),
        i: Field.DATE(),
        j: Field.TIMESTAMP(3),
        k: Field.TIMESTAMP(6),
        l: Field.BYTES(),
      },
    });

    const tree = Pipeline({
      name: 'type-test',
      children: GeneratorSource({
        schema,
        rowsPerSecond: 100,
        children: ConsoleSink({}),
      }),
    });

    const { plan } = compilePlan(tree);
    const genOp = plan.operators.find(o => o.config.case === 'generatorSource');
    if (genOp?.config.case === 'generatorSource') {
      const fields = genOp.config.value.schema?.fields ?? [];
      const typeMap = new globalThis.Map(fields.map(f => [f.name, f.arrowType]));

      expect(typeMap.get('a')).toBe(ArrowType.BOOLEAN);
      expect(typeMap.get('b')).toBe(ArrowType.INT8);
      expect(typeMap.get('c')).toBe(ArrowType.INT16);
      expect(typeMap.get('d')).toBe(ArrowType.INT32);
      expect(typeMap.get('e')).toBe(ArrowType.INT64);
      expect(typeMap.get('f')).toBe(ArrowType.FLOAT32);
      expect(typeMap.get('g')).toBe(ArrowType.FLOAT64);
      expect(typeMap.get('h')).toBe(ArrowType.STRING);
      expect(typeMap.get('i')).toBe(ArrowType.DATE32);
      expect(typeMap.get('j')).toBe(ArrowType.TIMESTAMP_MS);
      expect(typeMap.get('k')).toBe(ArrowType.TIMESTAMP_US);
      expect(typeMap.get('l')).toBe(ArrowType.BINARY);
    }
  });
});
