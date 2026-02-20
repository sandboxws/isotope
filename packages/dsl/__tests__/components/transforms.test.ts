import { describe, it, expect, beforeEach } from 'vitest';
import { resetNodeIdCounter } from '../../src/core/jsx-runtime.js';
import { Field } from '../../src/core/schema.js';
import { Filter, Map, FlatMap, Aggregate, Union, Deduplicate, TopN } from '../../src/components/transforms.js';

beforeEach(() => {
  resetNodeIdCounter();
});

describe('Filter', () => {
  it('creates a Transform node with condition', () => {
    const node = Filter({ condition: "amount > 100 AND country = 'US'" });

    expect(node.kind).toBe('Transform');
    expect(node.component).toBe('Filter');
    expect(node.props.condition).toBe("amount > 100 AND country = 'US'");
  });
});

describe('Map', () => {
  it('creates a Transform node with select', () => {
    const node = Map({
      select: {
        user_id: 'user_id',
        full_name: "CONCAT(first_name, ' ', last_name)",
      },
    });

    expect(node.component).toBe('Map');
    expect(node.props.select).toEqual({
      user_id: 'user_id',
      full_name: "CONCAT(first_name, ' ', last_name)",
    });
  });
});

describe('FlatMap', () => {
  it('creates a Transform node with unnest', () => {
    const node = FlatMap({
      unnest: 'tags',
      as: { tag: Field.STRING() },
    });

    expect(node.component).toBe('FlatMap');
    expect(node.props.unnest).toBe('tags');
  });
});

describe('Aggregate', () => {
  it('creates a Transform node with groupBy and select', () => {
    const node = Aggregate({
      groupBy: ['user_id'],
      select: { total: 'SUM(amount)', cnt: 'COUNT(*)' },
    });

    expect(node.component).toBe('Aggregate');
    expect(node.props.groupBy).toEqual(['user_id']);
    expect(node.props.select).toEqual({ total: 'SUM(amount)', cnt: 'COUNT(*)' });
  });
});

describe('Union', () => {
  it('creates a Transform node', () => {
    const node = Union({});
    expect(node.component).toBe('Union');
  });

  it('validates matching schemas', () => {
    const schemaA = {
      fields: { id: Field.BIGINT(), name: Field.STRING() },
    };
    const schemaB = {
      fields: { id: Field.BIGINT(), name: Field.STRING() },
    };

    // Should not throw
    expect(() => Union({ inputs: [schemaA, schemaB] })).not.toThrow();
  });

  it('throws on mismatched schemas', () => {
    const schemaA = {
      fields: { id: Field.BIGINT(), name: Field.STRING() },
    };
    const schemaB = {
      fields: { id: Field.BIGINT(), age: Field.INT() },
    };

    expect(() => Union({ inputs: [schemaA, schemaB] })).toThrow('Union schema mismatch');
  });
});

describe('Deduplicate', () => {
  it('creates a Transform node', () => {
    const node = Deduplicate({
      key: ['user_id'],
      order: 'event_time',
      keep: 'first',
    });

    expect(node.component).toBe('Deduplicate');
    expect(node.props.key).toEqual(['user_id']);
    expect(node.props.order).toBe('event_time');
    expect(node.props.keep).toBe('first');
  });
});

describe('TopN', () => {
  it('creates a Transform node', () => {
    const node = TopN({
      partitionBy: ['category'],
      orderBy: { amount: 'DESC' },
      n: 10,
    });

    expect(node.component).toBe('TopN');
    expect(node.props.n).toBe(10);
  });
});
