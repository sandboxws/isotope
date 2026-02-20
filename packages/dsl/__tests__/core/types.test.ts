import { describe, it, expect } from 'vitest';
import { ArrowType, createStream } from '../../src/core/types.js';

describe('ArrowType', () => {
  it('has all expected enum values', () => {
    expect(ArrowType.ARROW_INT8).toBe('ARROW_INT8');
    expect(ArrowType.ARROW_INT16).toBe('ARROW_INT16');
    expect(ArrowType.ARROW_INT32).toBe('ARROW_INT32');
    expect(ArrowType.ARROW_INT64).toBe('ARROW_INT64');
    expect(ArrowType.ARROW_FLOAT32).toBe('ARROW_FLOAT32');
    expect(ArrowType.ARROW_FLOAT64).toBe('ARROW_FLOAT64');
    expect(ArrowType.ARROW_STRING).toBe('ARROW_STRING');
    expect(ArrowType.ARROW_BINARY).toBe('ARROW_BINARY');
    expect(ArrowType.ARROW_BOOLEAN).toBe('ARROW_BOOLEAN');
    expect(ArrowType.ARROW_TIMESTAMP_MS).toBe('ARROW_TIMESTAMP_MS');
    expect(ArrowType.ARROW_TIMESTAMP_US).toBe('ARROW_TIMESTAMP_US');
    expect(ArrowType.ARROW_DATE32).toBe('ARROW_DATE32');
    expect(ArrowType.ARROW_DECIMAL128).toBe('ARROW_DECIMAL128');
    expect(ArrowType.ARROW_LIST).toBe('ARROW_LIST');
    expect(ArrowType.ARROW_MAP).toBe('ARROW_MAP');
    expect(ArrowType.ARROW_STRUCT).toBe('ARROW_STRUCT');
  });

  it('enum has exactly 16 values', () => {
    expect(Object.keys(ArrowType)).toHaveLength(16);
  });
});

describe('createStream', () => {
  it('creates a stream with default changelog mode', () => {
    const schema = {
      id: { type: 'BIGINT', arrowType: ArrowType.ARROW_INT64 },
    };
    const stream = createStream('node_1', schema);

    expect(stream._tag).toBe('Stream');
    expect(stream._nodeId).toBe('node_1');
    expect(stream._schema).toEqual(schema);
    expect(stream._changelogMode).toBe('append-only');
  });

  it('creates a stream with explicit changelog mode', () => {
    const schema = {
      id: { type: 'BIGINT', arrowType: ArrowType.ARROW_INT64 },
    };
    const stream = createStream('node_2', schema, 'upsert');

    expect(stream._changelogMode).toBe('upsert');
  });
});
