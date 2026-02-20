package operators

import (
	"context"
	"testing"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"
	"github.com/apache/arrow-go/v18/arrow/memory"

	"github.com/sandboxws/isotope/runtime/pkg/operator"
)

// ── Test helpers ────────────────────────────────────────────────────

func newCtx(alloc memory.Allocator) *operator.Context {
	return operator.NewContext(context.Background(), alloc, "test-op", "test")
}

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

func makeFloat64Arr(alloc memory.Allocator, vals []float64) arrow.Array {
	bldr := array.NewFloat64Builder(alloc)
	defer bldr.Release()
	bldr.AppendValues(vals, nil)
	return bldr.NewArray()
}

// ── Filter tests ────────────────────────────────────────────────────

func TestFilter(t *testing.T) {
	alloc := memory.NewCheckedAllocator(memory.DefaultAllocator)
	defer alloc.AssertSize(t, 0)

	batch := makeBatch(alloc, []string{"amount", "country"},
		[]arrow.Array{
			makeInt64Arr(alloc, []int64{50, 150, 100, 200}),
			makeStringArr(alloc, []string{"US", "UK", "US", "CA"}),
		})
	defer batch.Release()

	f := NewFilter("amount > 100")
	if err := f.Open(newCtx(alloc)); err != nil {
		t.Fatal(err)
	}
	defer f.Close()

	results, err := f.ProcessBatch(batch)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result batch, got %d", len(results))
	}
	defer results[0].Release()

	if results[0].NumRows() != 2 {
		t.Fatalf("expected 2 rows, got %d", results[0].NumRows())
	}

	amounts := results[0].Column(0).(*array.Int64)
	if amounts.Value(0) != 150 || amounts.Value(1) != 200 {
		t.Errorf("unexpected amounts: %v, %v", amounts.Value(0), amounts.Value(1))
	}
}

func TestFilterNoMatches(t *testing.T) {
	alloc := memory.NewCheckedAllocator(memory.DefaultAllocator)
	defer alloc.AssertSize(t, 0)

	batch := makeBatch(alloc, []string{"x"},
		[]arrow.Array{makeInt64Arr(alloc, []int64{1, 2, 3})})
	defer batch.Release()

	f := NewFilter("x > 100")
	if err := f.Open(newCtx(alloc)); err != nil {
		t.Fatal(err)
	}
	defer f.Close()

	results, err := f.ProcessBatch(batch)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 0 {
		for _, r := range results {
			r.Release()
		}
		t.Fatalf("expected 0 result batches, got %d", len(results))
	}
}

// ── Map tests ───────────────────────────────────────────────────────

func TestMap(t *testing.T) {
	alloc := memory.NewCheckedAllocator(memory.DefaultAllocator)
	defer alloc.AssertSize(t, 0)

	batch := makeBatch(alloc, []string{"price", "name"},
		[]arrow.Array{
			makeInt64Arr(alloc, []int64{10, 20, 30}),
			makeStringArr(alloc, []string{"a", "b", "c"}),
		})
	defer batch.Release()

	m := NewMap(map[string]string{
		"double_price": "price * 2",
		"upper_name":   "UPPER(name)",
	})
	if err := m.Open(newCtx(alloc)); err != nil {
		t.Fatal(err)
	}
	defer m.Close()

	results, err := m.ProcessBatch(batch)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	defer results[0].Release()

	if results[0].NumCols() != 2 {
		t.Fatalf("expected 2 columns, got %d", results[0].NumCols())
	}
	if results[0].NumRows() != 3 {
		t.Fatalf("expected 3 rows, got %d", results[0].NumRows())
	}

	// Column names are sorted alphabetically.
	schema := results[0].Schema()
	if schema.Field(0).Name != "double_price" {
		t.Errorf("expected first col 'double_price', got %q", schema.Field(0).Name)
	}
	if schema.Field(1).Name != "upper_name" {
		t.Errorf("expected second col 'upper_name', got %q", schema.Field(1).Name)
	}

	prices := results[0].Column(0).(*array.Int64)
	if prices.Value(0) != 20 || prices.Value(1) != 40 || prices.Value(2) != 60 {
		t.Errorf("unexpected prices: %v, %v, %v", prices.Value(0), prices.Value(1), prices.Value(2))
	}

	names := results[0].Column(1).(*array.String)
	if names.Value(0) != "A" || names.Value(1) != "B" || names.Value(2) != "C" {
		t.Errorf("unexpected names: %q, %q, %q", names.Value(0), names.Value(1), names.Value(2))
	}
}

// ── Rename tests ────────────────────────────────────────────────────

func TestRename(t *testing.T) {
	alloc := memory.NewCheckedAllocator(memory.DefaultAllocator)
	defer alloc.AssertSize(t, 0)

	batch := makeBatch(alloc, []string{"old_col", "keep_col"},
		[]arrow.Array{
			makeInt64Arr(alloc, []int64{1, 2}),
			makeStringArr(alloc, []string{"a", "b"}),
		})
	defer batch.Release()

	r := NewRename(map[string]string{"old_col": "new_col"})
	if err := r.Open(newCtx(alloc)); err != nil {
		t.Fatal(err)
	}
	defer r.Close()

	results, err := r.ProcessBatch(batch)
	if err != nil {
		t.Fatal(err)
	}
	defer results[0].Release()

	schema := results[0].Schema()
	if schema.Field(0).Name != "new_col" {
		t.Errorf("expected 'new_col', got %q", schema.Field(0).Name)
	}
	if schema.Field(1).Name != "keep_col" {
		t.Errorf("expected 'keep_col', got %q", schema.Field(1).Name)
	}
}

// ── Drop tests ──────────────────────────────────────────────────────

func TestDrop(t *testing.T) {
	alloc := memory.NewCheckedAllocator(memory.DefaultAllocator)
	defer alloc.AssertSize(t, 0)

	batch := makeBatch(alloc, []string{"a", "b", "c"},
		[]arrow.Array{
			makeInt64Arr(alloc, []int64{1, 2}),
			makeInt64Arr(alloc, []int64{3, 4}),
			makeInt64Arr(alloc, []int64{5, 6}),
		})
	defer batch.Release()

	d := NewDrop([]string{"b"})
	if err := d.Open(newCtx(alloc)); err != nil {
		t.Fatal(err)
	}
	defer d.Close()

	results, err := d.ProcessBatch(batch)
	if err != nil {
		t.Fatal(err)
	}
	defer results[0].Release()

	if results[0].NumCols() != 2 {
		t.Fatalf("expected 2 columns, got %d", results[0].NumCols())
	}
	schema := results[0].Schema()
	if schema.Field(0).Name != "a" || schema.Field(1).Name != "c" {
		t.Errorf("expected [a, c], got [%s, %s]", schema.Field(0).Name, schema.Field(1).Name)
	}
}

// ── Cast tests ──────────────────────────────────────────────────────

func TestCast(t *testing.T) {
	alloc := memory.NewCheckedAllocator(memory.DefaultAllocator)
	defer alloc.AssertSize(t, 0)

	batch := makeBatch(alloc, []string{"val"},
		[]arrow.Array{makeInt64Arr(alloc, []int64{10, 20, 30})})
	defer batch.Release()

	c := NewCast([]CastColumn{
		{Name: "val", TargetType: arrow.PrimitiveTypes.Float64},
	})
	if err := c.Open(newCtx(alloc)); err != nil {
		t.Fatal(err)
	}
	defer c.Close()

	results, err := c.ProcessBatch(batch)
	if err != nil {
		t.Fatal(err)
	}
	defer results[0].Release()

	floats := results[0].Column(0).(*array.Float64)
	if floats.Value(0) != 10.0 || floats.Value(1) != 20.0 || floats.Value(2) != 30.0 {
		t.Errorf("unexpected floats: %v, %v, %v", floats.Value(0), floats.Value(1), floats.Value(2))
	}
}

// ── Union tests ─────────────────────────────────────────────────────

func TestUnion(t *testing.T) {
	alloc := memory.NewCheckedAllocator(memory.DefaultAllocator)
	defer alloc.AssertSize(t, 0)

	batch := makeBatch(alloc, []string{"x"},
		[]arrow.Array{makeInt64Arr(alloc, []int64{1, 2, 3})})
	defer batch.Release()

	u := NewUnion()
	if err := u.Open(newCtx(alloc)); err != nil {
		t.Fatal(err)
	}
	defer u.Close()

	results, err := u.ProcessBatch(batch)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	defer results[0].Release()

	if results[0].NumRows() != 3 {
		t.Errorf("expected 3 rows, got %d", results[0].NumRows())
	}
}

// ── Route tests ─────────────────────────────────────────────────────

func TestRoute(t *testing.T) {
	alloc := memory.NewCheckedAllocator(memory.DefaultAllocator)
	defer alloc.AssertSize(t, 0)

	batch := makeBatch(alloc, []string{"val"},
		[]arrow.Array{makeInt64Arr(alloc, []int64{10, 50, 20, 80})})
	defer batch.Release()

	highCh := make(chan arrow.Record, 10)
	r := NewRoute([]RouteBranch{
		{ConditionSQL: "val > 30", Output: highCh},
	})
	if err := r.Open(newCtx(alloc)); err != nil {
		t.Fatal(err)
	}
	defer r.Close()

	results, err := r.ProcessBatch(batch)
	if err != nil {
		t.Fatal(err)
	}

	// Check routed batch (val > 30).
	select {
	case routed := <-highCh:
		if routed.NumRows() != 2 {
			t.Errorf("expected 2 routed rows, got %d", routed.NumRows())
		}
		routed.Release()
	default:
		t.Error("expected a routed batch on highCh")
	}

	// Check unmatched (default) rows.
	if len(results) != 1 {
		t.Fatalf("expected 1 default result, got %d", len(results))
	}
	defer results[0].Release()

	if results[0].NumRows() != 2 {
		t.Errorf("expected 2 unmatched rows, got %d", results[0].NumRows())
	}
}

// ── Varied batch size tests ─────────────────────────────────────────

func TestFilterVariedSizes(t *testing.T) {
	sizes := []int{1, 100, 4096, 8192}

	for _, size := range sizes {
		alloc := memory.NewCheckedAllocator(memory.DefaultAllocator)

		vals := make([]int64, size)
		for i := range vals {
			vals[i] = int64(i)
		}
		batch := makeBatch(alloc, []string{"x"},
			[]arrow.Array{makeInt64Arr(alloc, vals)})

		f := NewFilter("x >= 0")
		if err := f.Open(newCtx(alloc)); err != nil {
			batch.Release()
			t.Fatal(err)
		}

		results, err := f.ProcessBatch(batch)
		if err != nil {
			batch.Release()
			f.Close()
			t.Fatal(err)
		}

		if len(results) != 1 || results[0].NumRows() != int64(size) {
			t.Errorf("size=%d: expected %d rows, got %d", size, size, results[0].NumRows())
		}
		for _, r := range results {
			r.Release()
		}
		batch.Release()
		f.Close()
		alloc.AssertSize(t, 0)
	}
}
