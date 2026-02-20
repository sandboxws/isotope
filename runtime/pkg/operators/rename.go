package operators

import (
	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"

	"github.com/sandboxws/isotope/runtime/pkg/operator"
)

// Rename creates a new RecordBatch with renamed columns.
// Columns not in the rename map are kept with their original names.
type Rename struct {
	columns map[string]string // old_name -> new_name
}

// NewRename creates a Rename operator.
func NewRename(columns map[string]string) *Rename {
	return &Rename{columns: columns}
}

func (r *Rename) Open(_ *operator.Context) error { return nil }

func (r *Rename) ProcessBatch(batch arrow.Record) ([]arrow.Record, error) {
	schema := batch.Schema()
	newFields := make([]arrow.Field, schema.NumFields())
	arrays := make([]arrow.Array, schema.NumFields())

	for i := 0; i < schema.NumFields(); i++ {
		f := schema.Field(i)
		if newName, ok := r.columns[f.Name]; ok {
			f.Name = newName
		}
		newFields[i] = f
		arrays[i] = batch.Column(i)
	}

	newSchema := arrow.NewSchema(newFields, nil)
	result := array.NewRecord(newSchema, arrays, batch.NumRows())
	return []arrow.Record{result}, nil
}

func (r *Rename) ProcessWatermark(_ operator.Watermark) error                { return nil }
func (r *Rename) ProcessCheckpointBarrier(_ operator.CheckpointBarrier) error { return nil }
func (r *Rename) Close() error                                              { return nil }
