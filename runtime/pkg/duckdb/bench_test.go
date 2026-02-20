//go:build duckdb

package duckdb

import (
	"fmt"
	"testing"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/memory"
)

func BenchmarkDuckDBOverhead(b *testing.B) {
	sizes := []int{100, 1000, 10000, 100000}

	for _, size := range sizes {
		b.Run(fmt.Sprintf("rows=%d", size), func(b *testing.B) {
			alloc := memory.DefaultAllocator

			inst, err := NewInstance(alloc, 0)
			if err != nil {
				b.Fatal(err)
			}
			defer inst.Close()

			// Pre-build the batch.
			vals := make([]int64, size)
			for i := range vals {
				vals[i] = int64(i)
			}
			batch := makeBatch(alloc, []string{"x"},
				[]arrow.Array{makeInt64Arr(alloc, vals)})
			defer batch.Release()

			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				if err := inst.RegisterView(batch, "input"); err != nil {
					b.Fatal(err)
				}
				result, err := inst.Query("SELECT x, x * 2 as doubled FROM input WHERE x > 50")
				if err != nil {
					b.Fatal(err)
				}
				result.Release()
			}
		})
	}
}
