//go:build duckdb

package duckdb

import (
	"fmt"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/memory"

	"github.com/sandboxws/isotope/runtime/pkg/operator"
)

// MicroBatchOperator collects incoming Arrow RecordBatches and flushes them
// to DuckDB as a registered view, executes a SQL query, and emits results.
type MicroBatchOperator struct {
	sql          string
	flushCount   int // flush after this many batches (0 = flush every batch)
	memoryLimit  int64
	inst         *Instance
	buffer       []arrow.Record
	alloc        memory.Allocator
}

// NewMicroBatchOperator creates a micro-batch operator that executes the given SQL.
// flushCount controls how many batches to accumulate before flushing (0 = every batch).
func NewMicroBatchOperator(sql string, flushCount int) *MicroBatchOperator {
	return &MicroBatchOperator{
		sql:        sql,
		flushCount: flushCount,
	}
}

// SetMemoryLimit sets the DuckDB memory limit in bytes.
func (m *MicroBatchOperator) SetMemoryLimit(limit int64) {
	m.memoryLimit = limit
}

func (m *MicroBatchOperator) Open(ctx *operator.Context) error {
	m.alloc = ctx.Alloc

	inst, err := NewInstance(ctx.Alloc, m.memoryLimit)
	if err != nil {
		return fmt.Errorf("micro-batch: %w", err)
	}
	m.inst = inst
	return nil
}

func (m *MicroBatchOperator) ProcessBatch(batch arrow.Record) ([]arrow.Record, error) {
	batch.Retain()
	m.buffer = append(m.buffer, batch)

	trigger := m.flushCount
	if trigger <= 0 {
		trigger = 1
	}

	if len(m.buffer) >= trigger {
		return m.flush()
	}
	return nil, nil
}

func (m *MicroBatchOperator) ProcessWatermark(_ operator.Watermark) error {
	// Flush on watermark.
	if len(m.buffer) > 0 {
		results, err := m.flush()
		if err != nil {
			return err
		}
		// In a watermark context, we'd need to emit these results.
		// For now, release them (the engine should handle this via ProcessBatch).
		for _, r := range results {
			r.Release()
		}
	}
	return nil
}

func (m *MicroBatchOperator) ProcessCheckpointBarrier(_ operator.CheckpointBarrier) error {
	return nil
}

func (m *MicroBatchOperator) Close() error {
	// Release any buffered batches.
	for _, b := range m.buffer {
		b.Release()
	}
	m.buffer = nil

	if m.inst != nil {
		return m.inst.Close()
	}
	return nil
}

// flush concatenates buffered batches, registers as a DuckDB view, executes SQL, and returns results.
func (m *MicroBatchOperator) flush() ([]arrow.Record, error) {
	if len(m.buffer) == 0 {
		return nil, nil
	}

	// Concatenate all buffered batches.
	var combined arrow.Record
	var err error
	if len(m.buffer) == 1 {
		combined = m.buffer[0]
	} else {
		combined, err = concatenateRecords(m.alloc, m.buffer)
		// Release individual buffers.
		for _, b := range m.buffer {
			b.Release()
		}
		if err != nil {
			m.buffer = nil
			return nil, fmt.Errorf("micro-batch: concatenate: %w", err)
		}
	}
	m.buffer = nil

	// Register the combined batch as "input" view.
	if err := m.inst.RegisterView(combined, "input"); err != nil {
		combined.Release()
		return nil, fmt.Errorf("micro-batch: register view: %w", err)
	}
	combined.Release()

	// Execute the SQL query.
	result, err := m.inst.Query(m.sql)
	if err != nil {
		return nil, fmt.Errorf("micro-batch: query: %w", err)
	}

	if result.NumRows() == 0 {
		result.Release()
		return nil, nil
	}

	return []arrow.Record{result}, nil
}
