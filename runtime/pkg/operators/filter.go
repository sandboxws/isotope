// Package operators implements the built-in stream operators for the Isotope runtime.
package operators

import (
	"context"

	"github.com/apache/arrow-go/v18/arrow"

	"github.com/sandboxws/isotope/runtime/pkg/expr"
	helpers "github.com/sandboxws/isotope/runtime/pkg/arrow/helpers"
	"github.com/sandboxws/isotope/runtime/pkg/operator"
)

// Filter evaluates a SQL condition against each batch and keeps only matching rows.
type Filter struct {
	conditionSQL string
	eval         *expr.Evaluator
}

// NewFilter creates a Filter operator with the given SQL condition.
func NewFilter(conditionSQL string) *Filter {
	return &Filter{conditionSQL: conditionSQL}
}

func (f *Filter) Open(ctx *operator.Context) error {
	f.eval = expr.NewEvaluator(ctx.Alloc)
	return nil
}

func (f *Filter) ProcessBatch(batch arrow.Record) ([]arrow.Record, error) {
	mask, err := f.eval.EvalBool(context.Background(), batch, f.conditionSQL)
	if err != nil {
		return nil, err
	}
	defer mask.Release()

	result, err := helpers.Filter(context.Background(), batch, mask)
	if err != nil {
		return nil, err
	}

	if result.NumRows() == 0 {
		result.Release()
		return nil, nil
	}
	return []arrow.Record{result}, nil
}

func (f *Filter) ProcessWatermark(_ operator.Watermark) error          { return nil }
func (f *Filter) ProcessCheckpointBarrier(_ operator.CheckpointBarrier) error { return nil }
func (f *Filter) Close() error                                        { return nil }
