import { describe, it, expect, beforeEach } from 'vitest';
import { createElement, resetNodeIdCounter } from '../../src/core/jsx-runtime.js';
import { Route } from '../../src/components/route.js';
import { Join, TemporalJoin, LookupJoin, IntervalJoin } from '../../src/components/joins.js';
import { TumbleWindow, SlideWindow, SessionWindow } from '../../src/components/windows.js';
import { MatchRecognize } from '../../src/components/cep.js';
import { RawSQL } from '../../src/components/escape-hatches.js';
import { Schema, Field } from '../../src/core/schema.js';

beforeEach(() => {
  resetNodeIdCounter();
});

describe('Route', () => {
  it('creates a Route with branches', () => {
    const branch1 = Route.Branch({
      condition: "level = 'ERROR'",
      children: [createElement('KafkaSink', { topic: 'errors', bootstrapServers: 'x' })],
    });
    const branch2 = Route.Branch({
      condition: "level = 'WARN'",
      children: [createElement('KafkaSink', { topic: 'warnings', bootstrapServers: 'x' })],
    });
    const def = Route.Default({
      children: [createElement('KafkaSink', { topic: 'other', bootstrapServers: 'x' })],
    });

    const node = Route({ children: [branch1, branch2, def] });

    expect(node.component).toBe('Route');
    expect(node.children).toHaveLength(3);
  });

  it('throws without a Route.Branch', () => {
    const sink = createElement('KafkaSink', { topic: 'out', bootstrapServers: 'x' });
    expect(() => Route({ children: [sink] })).toThrow('Route requires at least one Route.Branch');
  });

  it('Branch creates typed node', () => {
    const branch = Route.Branch({ condition: 'x > 1' });
    expect(branch.component).toBe('Route.Branch');
    expect(branch.props.condition).toBe('x > 1');
  });

  it('Default creates typed node', () => {
    const def = Route.Default({});
    expect(def.component).toBe('Route.Default');
  });
});

describe('Join', () => {
  it('creates a Join node with left and right inputs', () => {
    const left = createElement('KafkaSource', { _nameHint: 'left', topic: 'a', bootstrapServers: 'x', schema: { fields: {} } });
    const right = createElement('KafkaSource', { _nameHint: 'right', topic: 'b', bootstrapServers: 'x', schema: { fields: {} } });

    const node = Join({ left, right, on: 'a.id = b.id', type: 'inner' });

    expect(node.component).toBe('Join');
    expect(node.kind).toBe('Join');
    expect(node.props.left).toBe(left.id);
    expect(node.props.right).toBe(right.id);
    expect(node.children).toHaveLength(2);
  });

  it('throws without left or right', () => {
    expect(() => Join({ left: null as any, right: null as any, on: 'x = y' })).toThrow();
  });
});

describe('TemporalJoin', () => {
  it('creates a TemporalJoin node', () => {
    const stream = createElement('KafkaSource', { _nameHint: 'stream', topic: 'a', bootstrapServers: 'x', schema: { fields: {} } });
    const temporal = createElement('KafkaSource', { _nameHint: 'temporal', topic: 'b', bootstrapServers: 'x', schema: { fields: {} } });

    const node = TemporalJoin({ stream, temporal, on: 'a.id = b.id', asOf: 'a.ts' });

    expect(node.component).toBe('TemporalJoin');
    expect(node.kind).toBe('Join');
    expect(node.props.asOf).toBe('a.ts');
  });
});

describe('LookupJoin', () => {
  it('creates a LookupJoin node', () => {
    const input = createElement('KafkaSource', { _nameHint: 'input', topic: 'a', bootstrapServers: 'x', schema: { fields: {} } });

    const node = LookupJoin({
      input,
      table: 'dim_users',
      url: 'jdbc:postgresql://db:5432/users',
      on: 'a.user_id = dim_users.id',
    });

    expect(node.component).toBe('LookupJoin');
    expect(node.kind).toBe('Join');
  });
});

describe('IntervalJoin', () => {
  it('creates an IntervalJoin node', () => {
    const left = createElement('KafkaSource', { _nameHint: 'left', topic: 'a', bootstrapServers: 'x', schema: { fields: {} } });
    const right = createElement('KafkaSource', { _nameHint: 'right', topic: 'b', bootstrapServers: 'x', schema: { fields: {} } });

    const node = IntervalJoin({
      left,
      right,
      on: 'a.id = b.id',
      interval: { from: 'a.ts', to: "a.ts + INTERVAL '1' HOUR" },
    });

    expect(node.component).toBe('IntervalJoin');
    expect(node.kind).toBe('Join');
    expect(node.children).toHaveLength(2);
  });
});

describe('TumbleWindow', () => {
  it('creates a Window node', () => {
    const node = TumbleWindow({ size: '1 hour', on: 'event_time' });

    expect(node.component).toBe('TumbleWindow');
    expect(node.kind).toBe('Window');
    expect(node.props.size).toBe('1 hour');
  });
});

describe('SlideWindow', () => {
  it('creates a Window node', () => {
    const node = SlideWindow({ size: '1 hour', slide: '15 minutes', on: 'event_time' });

    expect(node.component).toBe('SlideWindow');
    expect(node.kind).toBe('Window');
    expect(node.props.slide).toBe('15 minutes');
  });
});

describe('SessionWindow', () => {
  it('creates a Window node', () => {
    const node = SessionWindow({ gap: '30 minutes', on: 'event_time' });

    expect(node.component).toBe('SessionWindow');
    expect(node.kind).toBe('Window');
    expect(node.props.gap).toBe('30 minutes');
  });
});

describe('MatchRecognize', () => {
  it('creates a CEP node', () => {
    const input = createElement('KafkaSource', { _nameHint: 'input', topic: 'a', bootstrapServers: 'x', schema: { fields: {} } });

    const node = MatchRecognize({
      input,
      pattern: 'A B+ C',
      define: { A: 'price > 100', B: 'price > LAST(A.price)', C: 'price < LAST(B.price)' },
      measures: { start_price: 'A.price', peak_price: 'LAST(B.price)' },
    });

    expect(node.component).toBe('MatchRecognize');
    expect(node.kind).toBe('CEP');
  });

  it('throws without required props', () => {
    const input = createElement('KafkaSource', { _nameHint: 'input', topic: 'a', bootstrapServers: 'x', schema: { fields: {} } });

    expect(() => MatchRecognize({ input, pattern: '', define: { A: 'true' }, measures: { x: 'A.x' } }))
      .toThrow('MatchRecognize requires a pattern');
    expect(() => MatchRecognize({ input, pattern: 'A', define: {}, measures: { x: 'A.x' } }))
      .toThrow('MatchRecognize requires at least one DEFINE clause');
    expect(() => MatchRecognize({ input, pattern: 'A', define: { A: 'true' }, measures: {} }))
      .toThrow('MatchRecognize requires at least one MEASURES expression');
  });
});

describe('RawSQL', () => {
  it('creates a RawSQL node', () => {
    const input = createElement('KafkaSource', { _nameHint: 'input', topic: 'a', bootstrapServers: 'x', schema: { fields: {} } });
    const schema = Schema({ fields: { result: Field.STRING() } });

    const node = RawSQL({
      sql: 'SELECT * FROM input WHERE x > 1',
      inputs: [input],
      outputSchema: schema,
    });

    expect(node.component).toBe('RawSQL');
    expect(node.kind).toBe('RawSQL');
    expect(node.children).toHaveLength(1);
  });

  it('throws without inputs', () => {
    const schema = Schema({ fields: { result: Field.STRING() } });
    expect(() => RawSQL({ sql: 'SELECT 1', inputs: [], outputSchema: schema }))
      .toThrow('RawSQL requires at least one input stream');
  });
});
