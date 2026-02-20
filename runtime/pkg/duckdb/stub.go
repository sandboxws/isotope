//go:build !duckdb

// Package duckdb provides DuckDB micro-batch execution for Isotope operators.
// When compiled without the "duckdb" build tag, all functions return errors
// directing users to rebuild with -tags duckdb.
package duckdb

import (
	"errors"
	"fmt"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/memory"

	"github.com/sandboxws/isotope/runtime/pkg/operator"
)

// ErrDuckDBNotAvailable is returned when DuckDB functions are called
// without the duckdb build tag.
var ErrDuckDBNotAvailable = errors.New("DuckDB execution strategy requires building with -tags duckdb")

// Instance is a stub for DuckDB instance management.
type Instance struct{}

// NewInstance returns an error when DuckDB is not compiled in.
func NewInstance(_ memory.Allocator, _ int64) (*Instance, error) {
	return nil, ErrDuckDBNotAvailable
}

// Close is a no-op stub.
func (i *Instance) Close() error { return nil }

// RegisterView is a stub.
func (i *Instance) RegisterView(_ arrow.Record, _ string) error {
	return ErrDuckDBNotAvailable
}

// Query is a stub.
func (i *Instance) Query(_ string) (arrow.Record, error) {
	return nil, ErrDuckDBNotAvailable
}

// MicroBatchOperator is a stub for the micro-batch operator base.
type MicroBatchOperator struct{}

// NewMicroBatchOperator returns a stub operator.
func NewMicroBatchOperator(_ string, _ int) *MicroBatchOperator {
	return &MicroBatchOperator{}
}

func (m *MicroBatchOperator) Open(_ *operator.Context) error {
	return fmt.Errorf("micro-batch operator: %w", ErrDuckDBNotAvailable)
}

func (m *MicroBatchOperator) ProcessBatch(_ arrow.Record) ([]arrow.Record, error) {
	return nil, ErrDuckDBNotAvailable
}

func (m *MicroBatchOperator) ProcessWatermark(_ operator.Watermark) error          { return nil }
func (m *MicroBatchOperator) ProcessCheckpointBarrier(_ operator.CheckpointBarrier) error { return nil }
func (m *MicroBatchOperator) Close() error                                        { return nil }
