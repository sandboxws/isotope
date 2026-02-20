package operators

import (
	"github.com/apache/arrow-go/v18/arrow"

	"github.com/sandboxws/isotope/runtime/pkg/operator"
)

// Union merges batches from multiple inputs in arrival order.
// Since the engine feeds all input channels into the same operator goroutine,
// Union simply passes each batch through unchanged.
type Union struct{}

// NewUnion creates a Union operator.
func NewUnion() *Union { return &Union{} }

func (u *Union) Open(_ *operator.Context) error { return nil }

func (u *Union) ProcessBatch(batch arrow.Record) ([]arrow.Record, error) {
	batch.Retain()
	return []arrow.Record{batch}, nil
}

func (u *Union) ProcessWatermark(_ operator.Watermark) error                { return nil }
func (u *Union) ProcessCheckpointBarrier(_ operator.CheckpointBarrier) error { return nil }
func (u *Union) Close() error                                              { return nil }
