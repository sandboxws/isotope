import { describe, it, expect } from 'vitest';
import { ArrowType } from '../../src/core/types.js';
import { Schema, Field, isValidArrowType } from '../../src/core/schema.js';

describe('Field builders', () => {
  it('maps primitive types to correct ArrowType', () => {
    expect(Field.BOOLEAN().arrowType).toBe(ArrowType.ARROW_BOOLEAN);
    expect(Field.TINYINT().arrowType).toBe(ArrowType.ARROW_INT8);
    expect(Field.SMALLINT().arrowType).toBe(ArrowType.ARROW_INT16);
    expect(Field.INT().arrowType).toBe(ArrowType.ARROW_INT32);
    expect(Field.BIGINT().arrowType).toBe(ArrowType.ARROW_INT64);
    expect(Field.FLOAT().arrowType).toBe(ArrowType.ARROW_FLOAT32);
    expect(Field.DOUBLE().arrowType).toBe(ArrowType.ARROW_FLOAT64);
    expect(Field.STRING().arrowType).toBe(ArrowType.ARROW_STRING);
    expect(Field.DATE().arrowType).toBe(ArrowType.ARROW_DATE32);
    expect(Field.BYTES().arrowType).toBe(ArrowType.ARROW_BINARY);
  });

  it('maps parameterized types correctly', () => {
    expect(Field.DECIMAL(10, 2).arrowType).toBe(ArrowType.ARROW_DECIMAL128);
    expect(Field.DECIMAL(10, 2).type).toBe('DECIMAL(10, 2)');

    expect(Field.TIMESTAMP(3).arrowType).toBe(ArrowType.ARROW_TIMESTAMP_MS);
    expect(Field.TIMESTAMP(6).arrowType).toBe(ArrowType.ARROW_TIMESTAMP_US);

    expect(Field.TIMESTAMP_LTZ(3).arrowType).toBe(ArrowType.ARROW_TIMESTAMP_MS);
    expect(Field.TIMESTAMP_LTZ(6).arrowType).toBe(ArrowType.ARROW_TIMESTAMP_US);

    expect(Field.VARCHAR(255).arrowType).toBe(ArrowType.ARROW_STRING);
    expect(Field.CHAR(10).arrowType).toBe(ArrowType.ARROW_STRING);
  });

  it('maps composite types correctly', () => {
    const arrayField = Field.ARRAY(Field.INT());
    expect(arrayField.arrowType).toBe(ArrowType.ARROW_LIST);
    expect(arrayField.type).toBe('ARRAY<INT>');

    const mapField = Field.MAP(Field.STRING(), Field.INT());
    expect(mapField.arrowType).toBe(ArrowType.ARROW_MAP);
    expect(mapField.type).toBe('MAP<STRING, INT>');

    const rowField = Field.ROW({ name: Field.STRING(), age: Field.INT() });
    expect(rowField.arrowType).toBe(ArrowType.ARROW_STRUCT);
    expect(rowField.type).toBe('ROW<name STRING, age INT>');
  });

  it('preserves display type names', () => {
    expect(Field.BIGINT().type).toBe('BIGINT');
    expect(Field.STRING().type).toBe('STRING');
    expect(Field.TIMESTAMP(3).type).toBe('TIMESTAMP(3)');
    expect(Field.VARCHAR(100).type).toBe('VARCHAR(100)');
  });
});

describe('Schema', () => {
  it('creates a valid schema', () => {
    const schema = Schema({
      fields: {
        id: Field.BIGINT(),
        name: Field.STRING(),
        amount: Field.DOUBLE(),
      },
    });

    expect(schema.fields.id.arrowType).toBe(ArrowType.ARROW_INT64);
    expect(schema.fields.name.arrowType).toBe(ArrowType.ARROW_STRING);
    expect(schema.fields.amount.arrowType).toBe(ArrowType.ARROW_FLOAT64);
  });

  it('validates watermark column exists', () => {
    expect(() =>
      Schema({
        fields: { id: Field.BIGINT() },
        watermark: { column: 'nonexistent', expression: 'nonexistent - INTERVAL 5 SECOND' },
      }),
    ).toThrow("Watermark column 'nonexistent' is not a declared field");
  });

  it('accepts valid watermark', () => {
    const schema = Schema({
      fields: {
        event_time: Field.TIMESTAMP(3),
        id: Field.BIGINT(),
      },
      watermark: { column: 'event_time', expression: 'event_time - INTERVAL 5 SECOND' },
    });

    expect(schema.watermark?.column).toBe('event_time');
  });

  it('validates primary key columns exist', () => {
    expect(() =>
      Schema({
        fields: { id: Field.BIGINT() },
        primaryKey: { columns: ['id', 'missing'] },
      }),
    ).toThrow("Primary key column 'missing' is not a declared field");
  });

  it('accepts valid primary key', () => {
    const schema = Schema({
      fields: {
        id: Field.BIGINT(),
        name: Field.STRING(),
      },
      primaryKey: { columns: ['id'] },
    });

    expect(schema.primaryKey?.columns).toEqual(['id']);
  });
});

describe('isValidArrowType', () => {
  it('returns true for valid Arrow types', () => {
    expect(isValidArrowType(ArrowType.ARROW_INT64)).toBe(true);
    expect(isValidArrowType(ArrowType.ARROW_STRING)).toBe(true);
  });

  it('returns false for invalid types', () => {
    expect(isValidArrowType('INVALID')).toBe(false);
    expect(isValidArrowType('BIGINT')).toBe(false);
  });
});
