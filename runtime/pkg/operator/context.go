package operator

import (
	"context"
	"log/slog"
	"sync/atomic"

	"github.com/apache/arrow-go/v18/arrow/memory"
)

// Metrics tracks basic operator-level metrics.
type Metrics struct {
	BatchesProcessed atomic.Int64
	RowsProcessed    atomic.Int64
	Errors           atomic.Int64
}

// Context provides the execution environment for an operator.
type Context struct {
	// Go context for cancellation and shutdown.
	Ctx context.Context

	// Logger scoped to this operator.
	Logger *slog.Logger

	// Metrics for this operator instance.
	Metrics *Metrics

	// Alloc is the Arrow memory allocator to use for output batches.
	Alloc memory.Allocator

	// OperatorID is the unique identifier for this operator in the plan.
	OperatorID string

	// OperatorName is the human-readable name of this operator.
	OperatorName string

	// Parallelism is the total number of parallel instances of this operator.
	Parallelism int

	// InstanceIndex is the index of this parallel instance (0-based).
	InstanceIndex int
}

// NewContext creates a new operator context with defaults.
func NewContext(ctx context.Context, alloc memory.Allocator, operatorID, operatorName string) *Context {
	return &Context{
		Ctx:          ctx,
		Logger:       slog.Default().With("operator", operatorID, "name", operatorName),
		Metrics:      &Metrics{},
		Alloc:        alloc,
		OperatorID:   operatorID,
		OperatorName: operatorName,
		Parallelism:  1,
	}
}

// Done returns the context's Done channel for shutdown signaling.
func (c *Context) Done() <-chan struct{} {
	return c.Ctx.Done()
}
