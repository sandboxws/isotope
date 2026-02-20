import { describe, it, expect, beforeEach } from 'vitest';
import { resetNodeIdCounter } from '../../src/core/jsx-runtime.js';
import { Schema, Field } from '../../src/core/schema.js';
import { KafkaSource, GeneratorSource } from '../../src/components/sources.js';

const testSchema = Schema({
  fields: {
    id: Field.BIGINT(),
    name: Field.STRING(),
  },
});

beforeEach(() => {
  resetNodeIdCounter();
});

describe('KafkaSource', () => {
  it('creates a Source node', () => {
    const node = KafkaSource({
      topic: 'orders',
      bootstrapServers: 'kafka:9092',
      schema: testSchema,
    });

    expect(node.kind).toBe('Source');
    expect(node.component).toBe('KafkaSource');
    expect(node.id).toBe('orders');
    expect(node.props.topic).toBe('orders');
    expect(node.props.bootstrapServers).toBe('kafka:9092');
  });

  it('uses custom name as ID hint', () => {
    const node = KafkaSource({
      name: 'my_source',
      topic: 'orders',
      bootstrapServers: 'kafka:9092',
      schema: testSchema,
    });

    expect(node.id).toBe('my_source');
  });

  it('normalizes topic name for ID', () => {
    const node = KafkaSource({
      topic: 'my-topic.v1',
      bootstrapServers: 'kafka:9092',
      schema: testSchema,
    });

    expect(node.id).toBe('my_topic_v1');
  });

  it('passes through all props', () => {
    const node = KafkaSource({
      topic: 'orders',
      bootstrapServers: 'kafka:9092',
      schema: testSchema,
      format: 'csv',
      startupMode: 'earliest-offset',
      consumerGroup: 'my-group',
    });

    expect(node.props.format).toBe('csv');
    expect(node.props.startupMode).toBe('earliest-offset');
    expect(node.props.consumerGroup).toBe('my-group');
  });
});

describe('GeneratorSource', () => {
  it('creates a Source node', () => {
    const node = GeneratorSource({
      schema: testSchema,
      rowsPerSecond: 100,
    });

    expect(node.kind).toBe('Source');
    expect(node.component).toBe('GeneratorSource');
    expect(node.props.rowsPerSecond).toBe(100);
  });

  it('uses custom name', () => {
    const node = GeneratorSource({
      name: 'my_gen',
      schema: testSchema,
      rowsPerSecond: 10,
      maxRows: 1000,
    });

    expect(node.id).toBe('my_gen');
    expect(node.props.maxRows).toBe(1000);
  });
});
