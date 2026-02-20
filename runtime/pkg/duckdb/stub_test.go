//go:build !duckdb

package duckdb

import (
	"errors"
	"testing"

	"github.com/apache/arrow-go/v18/arrow/memory"
)

func TestStubReturnsError(t *testing.T) {
	alloc := memory.DefaultAllocator

	_, err := NewInstance(alloc, 0)
	if err == nil {
		t.Fatal("expected error from stub NewInstance")
	}
	if !errors.Is(err, ErrDuckDBNotAvailable) {
		t.Errorf("expected ErrDuckDBNotAvailable, got: %v", err)
	}
}

func TestStubMicroBatchReturnsError(t *testing.T) {
	m := NewMicroBatchOperator("SELECT 1", 0)
	err := m.Open(nil)
	if err == nil {
		t.Fatal("expected error from stub Open")
	}
	if !errors.Is(err, ErrDuckDBNotAvailable) {
		t.Errorf("expected ErrDuckDBNotAvailable, got: %v", err)
	}
}
