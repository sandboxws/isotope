package expr

import (
	"context"
	"testing"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"
	"github.com/apache/arrow-go/v18/arrow/memory"
)

func TestComparisons(t *testing.T) {
	alloc := memory.NewCheckedAllocator(memory.DefaultAllocator)
	defer alloc.AssertSize(t, 0)
	ctx := context.Background()
	ev := NewEvaluator(alloc)

	batch := makeBatch(alloc, []string{"amount", "country"},
		[]arrow.Array{
			makeInt64(alloc, []int64{50, 150, 100, 200}),
			makeStringArr(alloc, []string{"US", "UK", "US", "CA"}),
		})
	defer batch.Release()

	// Test greater than
	result, err := ev.EvalBool(ctx, batch, "amount > 100")
	if err != nil {
		t.Fatal(err)
	}
	defer result.Release()

	expected := []bool{false, true, false, true}
	for i, exp := range expected {
		if result.Value(i) != exp {
			t.Errorf("amount > 100 [%d]: got %v, want %v", i, result.Value(i), exp)
		}
	}

	// Test equality
	result2, err := ev.EvalBool(ctx, batch, "country = 'US'")
	if err != nil {
		t.Fatal(err)
	}
	defer result2.Release()

	expected2 := []bool{true, false, true, false}
	for i, exp := range expected2 {
		if result2.Value(i) != exp {
			t.Errorf("country = 'US' [%d]: got %v, want %v", i, result2.Value(i), exp)
		}
	}
}

func TestLogicalOperators(t *testing.T) {
	alloc := memory.NewCheckedAllocator(memory.DefaultAllocator)
	defer alloc.AssertSize(t, 0)
	ctx := context.Background()
	ev := NewEvaluator(alloc)

	batch := makeBatch(alloc, []string{"amount", "country"},
		[]arrow.Array{
			makeInt64(alloc, []int64{50, 150, 100, 200}),
			makeStringArr(alloc, []string{"US", "UK", "US", "CA"}),
		})
	defer batch.Release()

	// Test AND
	result, err := ev.EvalBool(ctx, batch, "amount > 100 AND country = 'US'")
	if err != nil {
		t.Fatal(err)
	}
	defer result.Release()

	expected := []bool{false, false, false, false}
	for i, exp := range expected {
		if result.Value(i) != exp {
			t.Errorf("AND [%d]: got %v, want %v", i, result.Value(i), exp)
		}
	}

	// Test OR
	result2, err := ev.EvalBool(ctx, batch, "amount > 100 OR country = 'US'")
	if err != nil {
		t.Fatal(err)
	}
	defer result2.Release()

	expected2 := []bool{true, true, true, true}
	for i, exp := range expected2 {
		if result2.Value(i) != exp {
			t.Errorf("OR [%d]: got %v, want %v", i, result2.Value(i), exp)
		}
	}
}

func TestArithmetic(t *testing.T) {
	alloc := memory.NewCheckedAllocator(memory.DefaultAllocator)
	defer alloc.AssertSize(t, 0)
	ctx := context.Background()
	ev := NewEvaluator(alloc)

	batch := makeBatch(alloc, []string{"price"},
		[]arrow.Array{
			makeInt64(alloc, []int64{10, 20, 30}),
		})
	defer batch.Release()

	// Test multiplication
	result, err := ev.Eval(ctx, batch, "price * 2")
	if err != nil {
		t.Fatal(err)
	}
	defer result.Release()

	int64Arr := result.(*array.Int64)
	expected := []int64{20, 40, 60}
	for i, exp := range expected {
		if int64Arr.Value(i) != exp {
			t.Errorf("price * 2 [%d]: got %v, want %v", i, int64Arr.Value(i), exp)
		}
	}

	// Test addition
	result2, err := ev.Eval(ctx, batch, "price + 5")
	if err != nil {
		t.Fatal(err)
	}
	defer result2.Release()

	int64Arr2 := result2.(*array.Int64)
	expected2 := []int64{15, 25, 35}
	for i, exp := range expected2 {
		if int64Arr2.Value(i) != exp {
			t.Errorf("price + 5 [%d]: got %v, want %v", i, int64Arr2.Value(i), exp)
		}
	}
}

func TestStringFunctions(t *testing.T) {
	alloc := memory.NewCheckedAllocator(memory.DefaultAllocator)
	defer alloc.AssertSize(t, 0)
	ctx := context.Background()
	ev := NewEvaluator(alloc)

	batch := makeBatch(alloc, []string{"name"},
		[]arrow.Array{
			makeStringArr(alloc, []string{"alice", "Bob", " charlie "}),
		})
	defer batch.Release()

	// UPPER
	result, err := ev.Eval(ctx, batch, "UPPER(name)")
	if err != nil {
		t.Fatal(err)
	}
	defer result.Release()

	strArr := result.(*array.String)
	expectedUpper := []string{"ALICE", "BOB", " CHARLIE "}
	for i, exp := range expectedUpper {
		if strArr.Value(i) != exp {
			t.Errorf("UPPER [%d]: got %q, want %q", i, strArr.Value(i), exp)
		}
	}

	// LOWER
	result2, err := ev.Eval(ctx, batch, "LOWER(name)")
	if err != nil {
		t.Fatal(err)
	}
	defer result2.Release()

	strArr2 := result2.(*array.String)
	expectedLower := []string{"alice", "bob", " charlie "}
	for i, exp := range expectedLower {
		if strArr2.Value(i) != exp {
			t.Errorf("LOWER [%d]: got %q, want %q", i, strArr2.Value(i), exp)
		}
	}
}

func TestConcat(t *testing.T) {
	alloc := memory.NewCheckedAllocator(memory.DefaultAllocator)
	defer alloc.AssertSize(t, 0)
	ctx := context.Background()
	ev := NewEvaluator(alloc)

	batch := makeBatch(alloc, []string{"first", "last"},
		[]arrow.Array{
			makeStringArr(alloc, []string{"John", "Jane"}),
			makeStringArr(alloc, []string{"Doe", "Smith"}),
		})
	defer batch.Release()

	result, err := ev.Eval(ctx, batch, "CONCAT(first, ' ', last)")
	if err != nil {
		t.Fatal(err)
	}
	defer result.Release()

	strArr := result.(*array.String)
	expected := []string{"John Doe", "Jane Smith"}
	for i, exp := range expected {
		if strArr.Value(i) != exp {
			t.Errorf("CONCAT [%d]: got %q, want %q", i, strArr.Value(i), exp)
		}
	}
}

func TestCaseWhen(t *testing.T) {
	alloc := memory.NewCheckedAllocator(memory.DefaultAllocator)
	defer alloc.AssertSize(t, 0)
	ctx := context.Background()
	ev := NewEvaluator(alloc)

	batch := makeBatch(alloc, []string{"status"},
		[]arrow.Array{
			makeStringArr(alloc, []string{"active", "pending", "inactive"}),
		})
	defer batch.Release()

	result, err := ev.Eval(ctx, batch, "CASE WHEN status = 'active' THEN 1 WHEN status = 'pending' THEN 0 ELSE -1 END")
	if err != nil {
		t.Fatal(err)
	}
	defer result.Release()

	int64Arr := result.(*array.Int64)
	expected := []int64{1, 0, -1}
	for i, exp := range expected {
		if int64Arr.Value(i) != exp {
			t.Errorf("CASE [%d]: got %v, want %v", i, int64Arr.Value(i), exp)
		}
	}
}

func TestRegexpExtract(t *testing.T) {
	alloc := memory.NewCheckedAllocator(memory.DefaultAllocator)
	defer alloc.AssertSize(t, 0)
	ctx := context.Background()
	ev := NewEvaluator(alloc)

	batch := makeBatch(alloc, []string{"url"},
		[]arrow.Array{
			makeStringArr(alloc, []string{
				"https://example.com/path/to/page",
				"http://test.org/api/v1",
				"invalid-url",
			}),
		})
	defer batch.Release()

	result, err := ev.Eval(ctx, batch, "REGEXP_EXTRACT(url, 'https?://[^/]+(/.*)$', 1)")
	if err != nil {
		t.Fatal(err)
	}
	defer result.Release()

	strArr := result.(*array.String)
	if strArr.Value(0) != "/path/to/page" {
		t.Errorf("REGEXP_EXTRACT [0]: got %q, want %q", strArr.Value(0), "/path/to/page")
	}
	if strArr.Value(1) != "/api/v1" {
		t.Errorf("REGEXP_EXTRACT [1]: got %q, want %q", strArr.Value(1), "/api/v1")
	}
	if !strArr.IsNull(2) {
		t.Errorf("REGEXP_EXTRACT [2]: expected null, got %q", strArr.Value(2))
	}
}

// ── Test helpers ────────────────────────────────────────────────────

func makeBatch(alloc memory.Allocator, names []string, arrays []arrow.Array) arrow.Record {
	fields := make([]arrow.Field, len(names))
	for i, name := range names {
		fields[i] = arrow.Field{Name: name, Type: arrays[i].DataType()}
	}
	schema := arrow.NewSchema(fields, nil)
	rec := array.NewRecord(schema, arrays, int64(arrays[0].Len()))
	// NewRecord retains each array, so release our original references.
	for _, a := range arrays {
		a.Release()
	}
	return rec
}

func makeInt64(alloc memory.Allocator, vals []int64) arrow.Array {
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
