//go:build duckdb

package duckdb

import (
	"testing"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"
	"github.com/apache/arrow-go/v18/arrow/memory"
)

func makeBatch(alloc memory.Allocator, names []string, arrays []arrow.Array) arrow.Record {
	fields := make([]arrow.Field, len(names))
	for i, name := range names {
		fields[i] = arrow.Field{Name: name, Type: arrays[i].DataType()}
	}
	schema := arrow.NewSchema(fields, nil)
	rec := array.NewRecord(schema, arrays, int64(arrays[0].Len()))
	for _, a := range arrays {
		a.Release()
	}
	return rec
}

func makeInt64Arr(alloc memory.Allocator, vals []int64) arrow.Array {
	bldr := array.NewInt64Builder(alloc)
	defer bldr.Release()
	bldr.AppendValues(vals, nil)
	return bldr.NewArray()
}

func makeStringArr(alloc memory.Allocator, vals []string) arrow.Array {
	bldr := array.NewStringBuilder(alloc)
	defer bldr.Release()
	for _, v := range vals {
		bldr.Append(v)
	}
	return bldr.NewArray()
}

func TestInstanceCreateAndClose(t *testing.T) {
	alloc := memory.DefaultAllocator

	inst, err := NewInstance(alloc, 0) // default 256MB
	if err != nil {
		t.Fatal(err)
	}
	if err := inst.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestArrowRoundtrip(t *testing.T) {
	alloc := memory.DefaultAllocator

	inst, err := NewInstance(alloc, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer inst.Close()

	// Create a batch.
	batch := makeBatch(alloc, []string{"id", "name"},
		[]arrow.Array{
			makeInt64Arr(alloc, []int64{1, 2, 3}),
			makeStringArr(alloc, []string{"alice", "bob", "charlie"}),
		})
	defer batch.Release()

	// Register as view.
	if err := inst.RegisterView(batch, "input"); err != nil {
		t.Fatal(err)
	}

	// Query back.
	result, err := inst.Query("SELECT * FROM input ORDER BY id")
	if err != nil {
		t.Fatal(err)
	}
	defer result.Release()

	if result.NumRows() != 3 {
		t.Fatalf("expected 3 rows, got %d", result.NumRows())
	}

	ids := result.Column(0).(*array.Int64)
	if ids.Value(0) != 1 || ids.Value(1) != 2 || ids.Value(2) != 3 {
		t.Errorf("unexpected ids: %v, %v, %v", ids.Value(0), ids.Value(1), ids.Value(2))
	}
}

func TestAggregateQuery(t *testing.T) {
	alloc := memory.DefaultAllocator

	inst, err := NewInstance(alloc, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer inst.Close()

	batch := makeBatch(alloc, []string{"product_id", "amount"},
		[]arrow.Array{
			makeStringArr(alloc, []string{"A", "B", "A", "B", "A"}),
			makeInt64Arr(alloc, []int64{10, 20, 30, 40, 50}),
		})
	defer batch.Release()

	if err := inst.RegisterView(batch, "input"); err != nil {
		t.Fatal(err)
	}

	result, err := inst.Query("SELECT product_id, SUM(amount) as total FROM input GROUP BY product_id ORDER BY product_id")
	if err != nil {
		t.Fatal(err)
	}
	defer result.Release()

	if result.NumRows() != 2 {
		t.Fatalf("expected 2 rows, got %d", result.NumRows())
	}
}

func TestVariousDataTypes(t *testing.T) {
	alloc := memory.DefaultAllocator

	inst, err := NewInstance(alloc, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer inst.Close()

	// Int64 column.
	intArr := makeInt64Arr(alloc, []int64{1, 2, 3})
	// String column.
	strArr := makeStringArr(alloc, []string{"a", "b", "c"})
	// Boolean column.
	boolBldr := array.NewBooleanBuilder(alloc)
	boolBldr.AppendValues([]bool{true, false, true}, nil)
	boolArr := boolBldr.NewArray()
	boolBldr.Release()

	batch := makeBatch(alloc, []string{"int_col", "str_col", "bool_col"},
		[]arrow.Array{intArr, strArr, boolArr})
	defer batch.Release()

	if err := inst.RegisterView(batch, "input"); err != nil {
		t.Fatal(err)
	}

	result, err := inst.Query("SELECT * FROM input")
	if err != nil {
		t.Fatal(err)
	}
	defer result.Release()

	if result.NumRows() != 3 {
		t.Fatalf("expected 3 rows, got %d", result.NumRows())
	}
}
