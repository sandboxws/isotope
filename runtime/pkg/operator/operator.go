// Package operator defines the core Operator interface that all stream operators implement.
package operator

import (
	"github.com/apache/arrow-go/v18/arrow"
)

// Watermark represents a watermark advancing event time.
type Watermark struct {
	Timestamp int64 // milliseconds since epoch
}

// CheckpointBarrier signals that a checkpoint should be taken.
type CheckpointBarrier struct {
	CheckpointID int64
}

// Operator is the core interface for all stream operators.
// The lifecycle is: Open -> ProcessBatch* -> Close.
type Operator interface {
	// Open initializes the operator. Called once before any ProcessBatch.
	Open(ctx *Context) error

	// ProcessBatch processes one Arrow RecordBatch and returns zero or more output batches.
	// Implementations MUST Retain any input batch data they hold beyond this call.
	// The caller is responsible for releasing the input batch after this returns.
	ProcessBatch(batch arrow.Record) ([]arrow.Record, error)

	// ProcessWatermark handles an advancing watermark.
	ProcessWatermark(wm Watermark) error

	// ProcessCheckpointBarrier handles a checkpoint barrier.
	ProcessCheckpointBarrier(barrier CheckpointBarrier) error

	// Close releases resources. Called once during shutdown.
	Close() error
}

// Source is a specialization of Operator for source connectors that produce data.
// Sources run in their own goroutine and push batches to the output channel.
type Source interface {
	// Open initializes the source.
	Open(ctx *Context) error

	// Run starts producing batches to the output channel.
	// It should return when ctx.Done() is signaled or an error occurs.
	// The source MUST close the output channel when it stops.
	Run(ctx *Context, out chan<- arrow.Record) error

	// Close releases resources.
	Close() error
}

// Sink is a specialization of Operator for sink connectors that consume data.
type Sink interface {
	// Open initializes the sink.
	Open(ctx *Context) error

	// WriteBatch writes a RecordBatch to the external system.
	WriteBatch(batch arrow.Record) error

	// Close flushes and releases resources.
	Close() error
}
