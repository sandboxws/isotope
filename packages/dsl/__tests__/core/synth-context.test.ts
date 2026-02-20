import { describe, it, expect, beforeEach } from 'vitest';
import { createElement, resetNodeIdCounter } from '../../src/core/jsx-runtime.js';
import { SynthContext } from '../../src/core/synth-context.js';
import { Field, Schema } from '../../src/core/schema.js';

beforeEach(() => {
  resetNodeIdCounter();
});

const testSchema = Schema({
  fields: {
    id: Field.BIGINT(),
    value: Field.STRING(),
  },
});

describe('SynthContext', () => {
  it('builds DAG from a construct tree', () => {
    const source = createElement('KafkaSource', {
      _nameHint: 'input',
      topic: 'in',
      bootstrapServers: 'kafka:9092',
      schema: testSchema,
    });
    const filter = createElement('Filter', { condition: 'id > 0' });
    const sink = createElement('KafkaSink', {
      _nameHint: 'output',
      topic: 'out',
      bootstrapServers: 'kafka:9092',
    });

    const pipeline = createElement('Pipeline', { name: 'test' }, source, filter, sink);

    const ctx = new SynthContext();
    ctx.buildFromTree(pipeline);

    expect(ctx.getAllNodes()).toHaveLength(4);
    expect(ctx.getAllEdges().length).toBeGreaterThan(0);
  });

  it('performs topological sort', () => {
    const ctx = new SynthContext();

    const a = createElement('KafkaSource', { _nameHint: 'a', topic: 'a', bootstrapServers: 'x', schema: testSchema });
    const b = createElement('Filter', { condition: 'true' });
    const c = createElement('KafkaSink', { _nameHint: 'c', topic: 'c', bootstrapServers: 'x' });
    const pipeline = createElement('Pipeline', { name: 'test' }, a, b, c);

    ctx.buildFromTree(pipeline);
    const sorted = ctx.topologicalSort();

    expect(sorted).toHaveLength(4);
    // Pipeline should come first (root)
    expect(sorted[0].component).toBe('Pipeline');
  });

  it('detects orphan sources', () => {
    const ctx = new SynthContext();

    // Add a source with no outgoing edges
    const source = createElement('KafkaSource', {
      _nameHint: 'orphan',
      topic: 'orphan',
      bootstrapServers: 'x',
      schema: testSchema,
    });
    ctx.addNode(source);

    const diagnostics = ctx.detectOrphanSources();
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('error');
    expect(diagnostics[0].message).toContain('Orphan source');
  });

  it('detects dangling sinks', () => {
    const ctx = new SynthContext();

    // Add a sink with no incoming edges
    const sink = createElement('KafkaSink', {
      _nameHint: 'dangling',
      topic: 'dangling',
      bootstrapServers: 'x',
    });
    ctx.addNode(sink);

    const diagnostics = ctx.detectDanglingSinks();
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('error');
    expect(diagnostics[0].message).toContain('Dangling sink');
  });

  it('detects cycles via DFS', () => {
    const ctx = new SynthContext();

    const a = createElement('Filter', { condition: 'a' });
    const b = createElement('Filter', { condition: 'b' });

    ctx.addNode(a);
    ctx.addNode(b);
    ctx.addEdge(a.id, b.id);
    ctx.addEdge(b.id, a.id); // cycle!

    const diagnostics = ctx.detectCycles();
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('error');
    expect(diagnostics[0].message).toContain('Cycle detected');
  });

  it('throws on cycle during topological sort', () => {
    const ctx = new SynthContext();

    const a = createElement('Filter', { condition: 'a' });
    const b = createElement('Filter', { condition: 'b' });

    ctx.addNode(a);
    ctx.addNode(b);
    ctx.addEdge(a.id, b.id);
    ctx.addEdge(b.id, a.id);

    expect(() => ctx.topologicalSort()).toThrow('Cycle detected');
  });

  it('validate() returns combined diagnostics', () => {
    const ctx = new SynthContext();

    const source = createElement('KafkaSource', {
      _nameHint: 'orphan',
      topic: 'orphan',
      bootstrapServers: 'x',
      schema: testSchema,
    });
    const sink = createElement('KafkaSink', {
      _nameHint: 'dangling',
      topic: 'dangling',
      bootstrapServers: 'x',
    });

    ctx.addNode(source);
    ctx.addNode(sink);

    const diagnostics = ctx.validate();
    expect(diagnostics.length).toBeGreaterThanOrEqual(2);
  });

  it('getNodesByKind filters correctly', () => {
    const source = createElement('KafkaSource', {
      _nameHint: 'src',
      topic: 'in',
      bootstrapServers: 'x',
      schema: testSchema,
    });
    const filter = createElement('Filter', { condition: 'true' });
    const sink = createElement('KafkaSink', {
      _nameHint: 'snk',
      topic: 'out',
      bootstrapServers: 'x',
    });
    const pipeline = createElement('Pipeline', { name: 'test' }, source, filter, sink);

    const ctx = new SynthContext();
    ctx.buildFromTree(pipeline);

    expect(ctx.getNodesByKind('Source')).toHaveLength(1);
    expect(ctx.getNodesByKind('Sink')).toHaveLength(1);
    expect(ctx.getNodesByKind('Transform')).toHaveLength(1);
    expect(ctx.getNodesByKind('Source', 'Sink')).toHaveLength(2);
  });
});
