package operators

import (
	"fmt"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"
	"github.com/apache/arrow-go/v18/arrow/memory"

	"github.com/sandboxws/isotope/runtime/pkg/operator"
)

// FlatMap unnests an array (list) column, replicating other columns for each element.
type FlatMap struct {
	unnestColumn string
	alloc        memory.Allocator
}

// NewFlatMap creates a FlatMap operator.
func NewFlatMap(unnestColumn string) *FlatMap {
	return &FlatMap{unnestColumn: unnestColumn}
}

func (f *FlatMap) Open(ctx *operator.Context) error {
	f.alloc = ctx.Alloc
	return nil
}

func (f *FlatMap) ProcessBatch(batch arrow.Record) ([]arrow.Record, error) {
	schema := batch.Schema()

	// Find the unnest column.
	unnestIdx := -1
	for i := 0; i < schema.NumFields(); i++ {
		if schema.Field(i).Name == f.unnestColumn {
			unnestIdx = i
			break
		}
	}
	if unnestIdx < 0 {
		return nil, fmt.Errorf("flatmap: column %q not found", f.unnestColumn)
	}

	listCol, ok := batch.Column(unnestIdx).(*array.List)
	if !ok {
		return nil, fmt.Errorf("flatmap: column %q is not a list type, got %T", f.unnestColumn, batch.Column(unnestIdx))
	}

	listValues := listCol.ListValues()
	numRows := int(batch.NumRows())

	// Compute total output rows.
	totalOutput := 0
	for i := 0; i < numRows; i++ {
		if listCol.IsNull(i) {
			continue
		}
		start := int(listCol.Offsets()[i])
		end := int(listCol.Offsets()[i+1])
		totalOutput += end - start
	}

	if totalOutput == 0 {
		return nil, nil
	}

	// Build output fields: list column becomes its element type.
	newFields := make([]arrow.Field, schema.NumFields())
	for i := 0; i < schema.NumFields(); i++ {
		if i == unnestIdx {
			elemType := listCol.DataType().(*arrow.ListType).Elem()
			newFields[i] = arrow.Field{Name: schema.Field(i).Name, Type: elemType, Nullable: schema.Field(i).Nullable}
		} else {
			newFields[i] = schema.Field(i)
		}
	}

	// Create builders for each output column.
	builders := make([]array.Builder, schema.NumFields())
	for i := range newFields {
		builders[i] = array.NewBuilder(f.alloc, newFields[i].Type)
	}
	defer func() {
		for _, b := range builders {
			b.Release()
		}
	}()

	// Row-by-row expansion.
	for row := 0; row < numRows; row++ {
		if listCol.IsNull(row) {
			continue
		}
		start := int(listCol.Offsets()[row])
		end := int(listCol.Offsets()[row+1])

		for elemIdx := start; elemIdx < end; elemIdx++ {
			for col := 0; col < schema.NumFields(); col++ {
				if col == unnestIdx {
					appendFromArray(builders[col], listValues, elemIdx)
				} else {
					appendFromArray(builders[col], batch.Column(col), row)
				}
			}
		}
	}

	// Build result arrays.
	newArrays := make([]arrow.Array, schema.NumFields())
	for i, b := range builders {
		newArrays[i] = b.NewArray()
	}

	newSchema := arrow.NewSchema(newFields, nil)
	result := array.NewRecord(newSchema, newArrays, int64(totalOutput))
	for _, a := range newArrays {
		a.Release()
	}
	return []arrow.Record{result}, nil
}

// appendFromArray appends a single value from src[row] to builder.
func appendFromArray(bldr array.Builder, src arrow.Array, row int) {
	if src.IsNull(row) {
		bldr.AppendNull()
		return
	}
	switch b := bldr.(type) {
	case *array.Int64Builder:
		b.Append(src.(*array.Int64).Value(row))
	case *array.Int32Builder:
		b.Append(src.(*array.Int32).Value(row))
	case *array.Float64Builder:
		b.Append(src.(*array.Float64).Value(row))
	case *array.Float32Builder:
		b.Append(src.(*array.Float32).Value(row))
	case *array.StringBuilder:
		b.Append(src.(*array.String).Value(row))
	case *array.BooleanBuilder:
		b.Append(src.(*array.Boolean).Value(row))
	default:
		bldr.AppendNull()
	}
}

func (f *FlatMap) ProcessWatermark(_ operator.Watermark) error                { return nil }
func (f *FlatMap) ProcessCheckpointBarrier(_ operator.CheckpointBarrier) error { return nil }
func (f *FlatMap) Close() error                                              { return nil }
