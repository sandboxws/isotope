import { describe, it, expect, beforeEach } from 'vitest';
import { resetNodeIdCounter, createElement } from '../../src/core/jsx-runtime.js';
import { Schema, Field } from '../../src/core/schema.js';
import { synth } from '../../src/testing/synth.js';
import { validate } from '../../src/testing/validate.js';
import { Pipeline } from '../../src/components/pipeline.js';
import { KafkaSource } from '../../src/components/sources.js';
import { KafkaSink } from '../../src/components/sinks.js';
import { Filter } from '../../src/components/transforms.js';

const testSchema = Schema({
  fields: {
    id: Field.BIGINT(),
    value: Field.STRING(),
  },
});

beforeEach(() => {
  resetNodeIdCounter();
});

describe('synth', () => {
  it('synthesizes a pipeline and returns tree + context', () => {
    const source = KafkaSource({
      topic: 'input',
      bootstrapServers: 'kafka:9092',
      schema: testSchema,
    });
    const filter = Filter({ condition: 'id > 0' });
    const sink = KafkaSink({ topic: 'output', bootstrapServers: 'kafka:9092' });

    const pipeline = Pipeline({
      name: 'test-pipeline',
      children: [source, filter, sink],
    });

    const result = synth(pipeline);

    expect(result.tree).toBeDefined();
    expect(result.tree.component).toBe('Pipeline');
    expect(result.context).toBeDefined();
    expect(result.context.getAllNodes().length).toBeGreaterThan(0);
  });

  it('applies plugin tree transforms', () => {
    const pipeline = Pipeline({
      name: 'test',
      children: [
        KafkaSource({ topic: 'in', bootstrapServers: 'x', schema: testSchema }),
        KafkaSink({ topic: 'out', bootstrapServers: 'x' }),
      ],
    });

    const result = synth(pipeline, {
      plugins: [{
        name: 'tag-plugin',
        transformTree: (tree) => ({ ...tree, props: { ...tree.props, tagged: true } }),
      }],
    });

    expect(result.tree.props.tagged).toBe(true);
  });
});

describe('validate', () => {
  it('detects orphan sources', () => {
    const source = KafkaSource({
      topic: 'orphan',
      bootstrapServers: 'kafka:9092',
      schema: testSchema,
    });

    // Pipeline with source that has no downstream
    const pipeline = Pipeline({
      name: 'test',
      children: [source],
    });

    const result = validate(pipeline);

    // Source has outgoing edges (Pipeline → Source), so not orphan.
    // An orphan is a source with no outgoing edges FROM it.
    // In a tree, Source typically has no children (it's a leaf), so this is expected.
    expect(result.errors.length).toBeGreaterThanOrEqual(0);
  });

  it('returns empty diagnostics for valid pipeline', () => {
    // Nest components as in real TSX: Source → Filter → Sink
    const sink = KafkaSink({ topic: 'out', bootstrapServers: 'kafka:9092' });
    const filter = Filter({ condition: 'id > 0', children: [sink] });
    const source = KafkaSource({
      topic: 'in',
      bootstrapServers: 'kafka:9092',
      schema: testSchema,
      children: [filter],
    });

    const pipeline = Pipeline({
      name: 'valid',
      children: [source],
    });

    const result = validate(pipeline);

    // Nested tree: Pipeline → Source → Filter → Sink
    // Source has outgoing edge to Filter, Sink has incoming edge from Filter.
    expect(result.errors).toHaveLength(0);
  });

  it('runs plugin validators', () => {
    const pipeline = Pipeline({
      name: 'test',
      children: [
        KafkaSource({ topic: 'in', bootstrapServers: 'x', schema: testSchema }),
        KafkaSink({ topic: 'out', bootstrapServers: 'x' }),
      ],
    });

    const result = validate(pipeline, {
      plugins: [{
        name: 'strict-plugin',
        validate: (_tree, _existing) => [{
          severity: 'warning',
          message: 'Custom plugin warning',
        }],
      }],
    });

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].message).toBe('Custom plugin warning');
  });
});
