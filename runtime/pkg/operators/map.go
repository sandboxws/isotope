package operators

import (
	"context"
	"sort"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"
	"github.com/apache/arrow-go/v18/arrow/memory"

	"github.com/sandboxws/isotope/runtime/pkg/expr"
	"github.com/sandboxws/isotope/runtime/pkg/operator"
)

// Map evaluates column-level SQL expressions to produce a new RecordBatch.
// Each entry in Columns maps output_name → SQL expression.
type Map struct {
	columns map[string]string // output_name -> SQL expression
	eval    *expr.Evaluator
	alloc   memory.Allocator
}

// NewMap creates a Map operator.
func NewMap(columns map[string]string) *Map {
	return &Map{columns: columns}
}

func (m *Map) Open(ctx *operator.Context) error {
	m.eval = expr.NewEvaluator(ctx.Alloc)
	m.alloc = ctx.Alloc
	return nil
}

func (m *Map) ProcessBatch(batch arrow.Record) ([]arrow.Record, error) {
	// Sort column names for deterministic output order.
	names := make([]string, 0, len(m.columns))
	for name := range m.columns {
		names = append(names, name)
	}
	sort.Strings(names)

	fields := make([]arrow.Field, 0, len(names))
	arrays := make([]arrow.Array, 0, len(names))

	for _, name := range names {
		exprSQL := m.columns[name]
		arr, err := m.eval.Eval(context.Background(), batch, exprSQL)
		if err != nil {
			// Release any already-evaluated arrays.
			for _, a := range arrays {
				a.Release()
			}
			return nil, err
		}
		fields = append(fields, arrow.Field{Name: name, Type: arr.DataType()})
		arrays = append(arrays, arr)
	}

	schema := arrow.NewSchema(fields, nil)
	result := array.NewRecord(schema, arrays, batch.NumRows())
	// NewRecord retains each array; release our references.
	for _, a := range arrays {
		a.Release()
	}

	return []arrow.Record{result}, nil
}

func (m *Map) ProcessWatermark(_ operator.Watermark) error                { return nil }
func (m *Map) ProcessCheckpointBarrier(_ operator.CheckpointBarrier) error { return nil }
func (m *Map) Close() error                                              { return nil }
