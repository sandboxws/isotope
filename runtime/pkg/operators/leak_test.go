// Verifies that the CheckedAllocator memory leak detector properly catches
// un-released Arrow RecordBatches (task 12.4).
package operators

import (
	"testing"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/memory"
)

// TestMemoryLeakDetectorCatchesLeak verifies that CheckedAllocator detects
// an intentionally leaked RecordBatch. We use a sub-allocator so that
// the parent test's AssertSize sees the leak.
func TestMemoryLeakDetectorCatchesLeak(t *testing.T) {
	alloc := memory.NewCheckedAllocator(memory.DefaultAllocator)

	// Create a batch but intentionally do NOT release it.
	batch := makeBatch(alloc, []string{"x"},
		[]arrow.Array{makeInt64Arr(alloc, []int64{1, 2, 3})})

	// The allocator should report non-zero allocated bytes.
	// We can't call AssertSize(t, 0) because that would fail the test,
	// which is exactly what we want to verify happens.
	// Instead, we use CurrentAlloc to check for leaked bytes.
	allocated := alloc.CurrentAlloc()
	if allocated == 0 {
		t.Fatal("expected non-zero allocation for unreleased batch, got 0")
	}

	// Now release it and verify the allocator is happy.
	batch.Release()

	allocated = alloc.CurrentAlloc()
	if allocated != 0 {
		t.Errorf("expected 0 allocation after release, got %d", allocated)
	}

	// This should now pass without panic.
	alloc.AssertSize(t, 0)
}

// TestMemoryLeakDetectorPassesCleanCode verifies that properly released
// batches pass the leak check.
func TestMemoryLeakDetectorPassesCleanCode(t *testing.T) {
	alloc := memory.NewCheckedAllocator(memory.DefaultAllocator)
	defer alloc.AssertSize(t, 0)

	batch := makeBatch(alloc, []string{"a", "b"},
		[]arrow.Array{
			makeInt64Arr(alloc, []int64{10, 20}),
			makeStringArr(alloc, []string{"hello", "world"}),
		})

	// Process with an operator.
	f := NewFilter("a > 10")
	if err := f.Open(newCtx(alloc)); err != nil {
		batch.Release()
		t.Fatal(err)
	}
	defer f.Close()

	results, err := f.ProcessBatch(batch)
	if err != nil {
		batch.Release()
		t.Fatal(err)
	}

	// Release everything properly.
	for _, r := range results {
		r.Release()
	}
	batch.Release()

	// Allocator should be clean.
	if alloc.CurrentAlloc() != 0 {
		t.Errorf("expected 0 allocation, got %d", alloc.CurrentAlloc())
	}
}

// TestMemoryLeakDetectorMultipleBatches verifies leak detection across
// multiple batches, ensuring each batch's memory is tracked independently.
func TestMemoryLeakDetectorMultipleBatches(t *testing.T) {
	alloc := memory.NewCheckedAllocator(memory.DefaultAllocator)
	defer alloc.AssertSize(t, 0)

	batches := make([]arrow.Record, 5)
	for i := 0; i < 5; i++ {
		vals := make([]int64, 100)
		for j := range vals {
			vals[j] = int64(i*100 + j)
		}
		batches[i] = makeBatch(alloc, []string{"id"},
			[]arrow.Array{makeInt64Arr(alloc, vals)})
	}

	// Release all except one — verify memory is still allocated.
	for i := 0; i < 4; i++ {
		batches[i].Release()
	}

	if alloc.CurrentAlloc() == 0 {
		t.Fatal("expected non-zero alloc with one unreleased batch")
	}

	// Release the last one.
	batches[4].Release()

	if alloc.CurrentAlloc() != 0 {
		t.Errorf("expected 0 allocation after releasing all batches, got %d", alloc.CurrentAlloc())
	}
}
