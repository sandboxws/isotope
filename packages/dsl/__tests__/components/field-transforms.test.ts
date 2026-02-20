import { describe, it, expect, beforeEach } from 'vitest';
import { resetNodeIdCounter } from '../../src/core/jsx-runtime.js';
import { Field } from '../../src/core/schema.js';
import { Rename, Drop, Cast, Coalesce, AddField } from '../../src/components/field-transforms.js';

beforeEach(() => {
  resetNodeIdCounter();
});

describe('Rename', () => {
  it('creates a Transform node', () => {
    const node = Rename({ columns: { old_name: 'new_name' } });

    expect(node.component).toBe('Rename');
    expect(node.props.columns).toEqual({ old_name: 'new_name' });
  });
});

describe('Drop', () => {
  it('creates a Transform node', () => {
    const node = Drop({ columns: ['temp_field', 'debug_flag'] });

    expect(node.component).toBe('Drop');
    expect(node.props.columns).toEqual(['temp_field', 'debug_flag']);
  });
});

describe('Cast', () => {
  it('creates a Transform node with ArrowType-based columns', () => {
    const node = Cast({
      columns: {
        amount: Field.DOUBLE(),
        count: Field.BIGINT(),
      },
    });

    expect(node.component).toBe('Cast');
    const cols = node.props.columns as Record<string, any>;
    expect(cols.amount.arrowType).toBe('ARROW_FLOAT64');
    expect(cols.count.arrowType).toBe('ARROW_INT64');
  });

  it('does not have safe prop', () => {
    const node = Cast({ columns: { x: Field.INT() } });
    expect(node.props).not.toHaveProperty('safe');
  });
});

describe('Coalesce', () => {
  it('creates a Transform node', () => {
    const node = Coalesce({
      columns: { status: "'unknown'" },
    });

    expect(node.component).toBe('Coalesce');
    expect(node.props.columns).toEqual({ status: "'unknown'" });
  });
});

describe('AddField', () => {
  it('creates a Transform node', () => {
    const node = AddField({
      columns: { full_name: "CONCAT(first, ' ', last)" },
      types: { full_name: Field.STRING() },
    });

    expect(node.component).toBe('AddField');
    expect(node.props.columns).toEqual({ full_name: "CONCAT(first, ' ', last)" });
  });
});
