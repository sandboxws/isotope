package helpers

import (
	"fmt"
	"testing"

	"github.com/apache/arrow-go/v18/arrow/memory"
)

// NewTestAllocator creates a CheckedAllocator that tracks allocations.
// Call AssertNoLeaks at the end of the test to verify all memory was released.
func NewTestAllocator(t testing.TB) *memory.CheckedAllocator {
	return memory.NewCheckedAllocator(memory.DefaultAllocator)
}

// AssertNoLeaks verifies that all Arrow memory has been properly released.
// Panics with details about any leaked allocations.
func AssertNoLeaks(t testing.TB, alloc *memory.CheckedAllocator) {
	t.Helper()
	if alloc.CurrentAlloc() > 0 {
		t.Fatalf("Arrow memory leak detected: %d bytes still allocated", alloc.CurrentAlloc())
	}
}

// LeakDetector wraps an allocator and counts net allocations/frees.
type LeakDetector struct {
	inner       memory.Allocator
	allocated   int64
	freed       int64
	currentUsed int64
}

// NewLeakDetector creates a new leak detector wrapping the given allocator.
func NewLeakDetector(inner memory.Allocator) *LeakDetector {
	return &LeakDetector{inner: inner}
}

// Allocate allocates memory and tracks it.
func (ld *LeakDetector) Allocate(size int) []byte {
	ld.allocated += int64(size)
	ld.currentUsed += int64(size)
	return ld.inner.Allocate(size)
}

// Reallocate reallocates memory and tracks the size change.
func (ld *LeakDetector) Reallocate(size int, b []byte) []byte {
	oldSize := int64(len(b))
	ld.currentUsed += int64(size) - oldSize
	return ld.inner.Reallocate(size, b)
}

// Free frees memory and tracks it.
func (ld *LeakDetector) Free(b []byte) {
	ld.freed += int64(len(b))
	ld.currentUsed -= int64(len(b))
	ld.inner.Free(b)
}

// CurrentUsed returns the number of bytes currently allocated and not freed.
func (ld *LeakDetector) CurrentUsed() int64 {
	return ld.currentUsed
}

// AssertNoLeaks panics if there is leaked memory.
func (ld *LeakDetector) AssertNoLeaks() error {
	if ld.currentUsed != 0 {
		return fmt.Errorf("memory leak: %d bytes allocated, %d bytes freed, %d bytes still in use",
			ld.allocated, ld.freed, ld.currentUsed)
	}
	return nil
}
