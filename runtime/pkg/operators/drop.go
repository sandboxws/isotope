package operators

import (
	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"

	"github.com/sandboxws/isotope/runtime/pkg/operator"
)

// Drop removes specified columns from the RecordBatch.
type Drop struct {
	columns map[string]bool
}

// NewDrop creates a Drop operator.
func NewDrop(columns []string) *Drop {
	set := make(map[string]bool, len(columns))
	for _, c := range columns {
		set[c] = true
	}
	return &Drop{columns: set}
}

func (d *Drop) Open(_ *operator.Context) error { return nil }

func (d *Drop) ProcessBatch(batch arrow.Record) ([]arrow.Record, error) {
	schema := batch.Schema()
	var fields []arrow.Field
	var arrays []arrow.Array

	for i := 0; i < schema.NumFields(); i++ {
		f := schema.Field(i)
		if d.columns[f.Name] {
			continue
		}
		fields = append(fields, f)
		arrays = append(arrays, batch.Column(i))
	}

	newSchema := arrow.NewSchema(fields, nil)
	result := array.NewRecord(newSchema, arrays, batch.NumRows())
	return []arrow.Record{result}, nil
}

func (d *Drop) ProcessWatermark(_ operator.Watermark) error                { return nil }
func (d *Drop) ProcessCheckpointBarrier(_ operator.CheckpointBarrier) error { return nil }
func (d *Drop) Close() error                                              { return nil }
