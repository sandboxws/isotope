package operators

import (
	"context"
	"fmt"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"
	"github.com/apache/arrow-go/v18/arrow/memory"

	"github.com/sandboxws/isotope/runtime/pkg/expr"
	helpers "github.com/sandboxws/isotope/runtime/pkg/arrow/helpers"
	"github.com/sandboxws/isotope/runtime/pkg/operator"
)

// RouteBranch defines a condition and a target channel for the Route operator.
type RouteBranch struct {
	ConditionSQL string
	Output       chan<- arrow.Record
}

// Route evaluates branch conditions and splits the batch to different outputs.
// Each row goes to the first matching branch. Unmatched rows are returned
// from ProcessBatch (for the default output).
type Route struct {
	branches []RouteBranch
	eval     *expr.Evaluator
	alloc    memory.Allocator
}

// NewRoute creates a Route operator.
func NewRoute(branches []RouteBranch) *Route {
	return &Route{branches: branches}
}

func (r *Route) Open(ctx *operator.Context) error {
	r.eval = expr.NewEvaluator(ctx.Alloc)
	r.alloc = ctx.Alloc
	return nil
}

func (r *Route) ProcessBatch(batch arrow.Record) ([]arrow.Record, error) {
	ctx := context.Background()
	numRows := int(batch.NumRows())

	// Track which rows have been routed to a branch.
	routed := make([]bool, numRows)

	for _, branch := range r.branches {
		mask, err := r.eval.EvalBool(ctx, batch, branch.ConditionSQL)
		if err != nil {
			return nil, fmt.Errorf("route condition %q: %w", branch.ConditionSQL, err)
		}

		// Build a mask that is true only for rows matching this branch AND not yet routed.
		effectiveMask := array.NewBooleanBuilder(r.alloc)
		anyMatch := false
		for i := 0; i < numRows; i++ {
			match := !routed[i] && !mask.IsNull(i) && mask.Value(i)
			effectiveMask.Append(match)
			if match {
				routed[i] = true
				anyMatch = true
			}
		}
		mask.Release()
		maskArr := effectiveMask.NewArray()
		effectiveMask.Release()

		if anyMatch && branch.Output != nil {
			filtered, err := helpers.Filter(ctx, batch, maskArr)
			maskArr.Release()
			if err != nil {
				return nil, err
			}
			if filtered.NumRows() > 0 {
				branch.Output <- filtered
			} else {
				filtered.Release()
			}
		} else {
			maskArr.Release()
		}
	}

	// Build unmatched rows for default output.
	anyUnmatched := false
	for _, v := range routed {
		if !v {
			anyUnmatched = true
			break
		}
	}

	if !anyUnmatched {
		return nil, nil
	}

	// Build inverse mask.
	unmatchedMask := array.NewBooleanBuilder(r.alloc)
	for _, v := range routed {
		unmatchedMask.Append(!v)
	}
	maskArr := unmatchedMask.NewArray()
	unmatchedMask.Release()

	filtered, err := helpers.Filter(ctx, batch, maskArr)
	maskArr.Release()
	if err != nil {
		return nil, err
	}

	if filtered.NumRows() == 0 {
		filtered.Release()
		return nil, nil
	}
	return []arrow.Record{filtered}, nil
}

func (r *Route) ProcessWatermark(_ operator.Watermark) error                { return nil }
func (r *Route) ProcessCheckpointBarrier(_ operator.CheckpointBarrier) error { return nil }
func (r *Route) Close() error                                              { return nil }
