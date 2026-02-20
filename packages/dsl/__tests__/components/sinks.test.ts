import { describe, it, expect, beforeEach } from 'vitest';
import { resetNodeIdCounter } from '../../src/core/jsx-runtime.js';
import { KafkaSink, ConsoleSink } from '../../src/components/sinks.js';

beforeEach(() => {
  resetNodeIdCounter();
});

describe('KafkaSink', () => {
  it('creates a Sink node', () => {
    const node = KafkaSink({
      topic: 'output',
      bootstrapServers: 'kafka:9092',
    });

    expect(node.kind).toBe('Sink');
    expect(node.component).toBe('KafkaSink');
    expect(node.id).toBe('output');
  });

  it('supports keyBy prop', () => {
    const node = KafkaSink({
      topic: 'output',
      bootstrapServers: 'kafka:9092',
      keyBy: ['user_id'],
    });

    expect(node.props.keyBy).toEqual(['user_id']);
  });

  it('supports format prop', () => {
    const node = KafkaSink({
      topic: 'output',
      bootstrapServers: 'kafka:9092',
      format: 'csv',
    });

    expect(node.props.format).toBe('csv');
  });
});

describe('ConsoleSink', () => {
  it('creates a Sink node', () => {
    const node = ConsoleSink({});

    expect(node.kind).toBe('Sink');
    expect(node.component).toBe('ConsoleSink');
  });

  it('supports maxRows prop', () => {
    const node = ConsoleSink({ maxRows: 100 });
    expect(node.props.maxRows).toBe(100);
  });

  it('uses custom name', () => {
    const node = ConsoleSink({ name: 'debug_out' });
    expect(node.id).toBe('debug_out');
  });
});
