// Package helpers provides convenience functions for working with Arrow RecordBatches.
package helpers

import (
	"context"
	"fmt"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"
	"github.com/apache/arrow-go/v18/arrow/compute"
	"github.com/apache/arrow-go/v18/arrow/memory"
)

// Column returns the named column from a RecordBatch, or an error if not found.
func Column(batch arrow.Record, name string) (arrow.Array, error) {
	schema := batch.Schema()
	indices := schema.FieldIndices(name)
	if len(indices) == 0 {
		return nil, fmt.Errorf("column %q not found in schema", name)
	}
	return batch.Column(indices[0]), nil
}

// ColumnIndex returns the index of a named column, or -1 if not found.
func ColumnIndex(batch arrow.Record, name string) int {
	indices := batch.Schema().FieldIndices(name)
	if len(indices) == 0 {
		return -1
	}
	return indices[0]
}

// Filter applies a boolean mask to a RecordBatch, returning only rows where mask is true.
// The caller is responsible for releasing the returned Record.
func Filter(ctx context.Context, batch arrow.Record, mask arrow.Array) (arrow.Record, error) {
	result, err := compute.FilterRecordBatch(ctx, batch, mask, compute.DefaultFilterOptions())
	if err != nil {
		return nil, fmt.Errorf("filter: %w", err)
	}
	return result, nil
}

// Project creates a new RecordBatch with only the specified columns.
// The caller is responsible for releasing the returned Record.
func Project(alloc memory.Allocator, batch arrow.Record, cols ...string) (arrow.Record, error) {
	fields := make([]arrow.Field, 0, len(cols))
	arrays := make([]arrow.Array, 0, len(cols))

	for _, name := range cols {
		idx := ColumnIndex(batch, name)
		if idx < 0 {
			return nil, fmt.Errorf("column %q not found for projection", name)
		}
		fields = append(fields, batch.Schema().Field(idx))
		arrays = append(arrays, batch.Column(idx))
	}

	schema := arrow.NewSchema(fields, nil)
	result := array.NewRecord(schema, arrays, batch.NumRows())
	return result, nil
}

// ColumnNames returns the list of column names in a record's schema.
func ColumnNames(batch arrow.Record) []string {
	schema := batch.Schema()
	names := make([]string, schema.NumFields())
	for i := 0; i < schema.NumFields(); i++ {
		names[i] = schema.Field(i).Name
	}
	return names
}
