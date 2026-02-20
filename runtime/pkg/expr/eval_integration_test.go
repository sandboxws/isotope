// Integration test for the expression evaluator — verifies all expression types
// mentioned in task 12.3: comparisons, arithmetic, UPPER, COALESCE, CASE WHEN, REGEXP_EXTRACT.
package expr

import (
	"context"
	"testing"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"
	"github.com/apache/arrow-go/v18/arrow/memory"
)

// TestAllExpressionTypes is a comprehensive verification that all expression types
// work correctly in a single test. This serves as the integration smoke test.
func TestAllExpressionTypes(t *testing.T) {
	alloc := memory.NewCheckedAllocator(memory.DefaultAllocator)
	defer alloc.AssertSize(t, 0)

	ctx := context.Background()
	ev := NewEvaluator(alloc)

	// Build a batch with varied types to exercise all expressions.
	batch := makeBatch(alloc,
		[]string{"amount", "country", "name", "status", "url", "nullable_val"},
		[]arrow.Array{
			makeInt64(alloc, []int64{50, 150, 100, 200}),
			makeStringArr(alloc, []string{"US", "UK", "US", "CA"}),
			makeStringArr(alloc, []string{"alice", "Bob", " charlie ", "dave"}),
			makeStringArr(alloc, []string{"active", "pending", "inactive", "active"}),
			makeStringArr(alloc, []string{
				"https://example.com/path",
				"http://test.org/api/v1",
				"invalid-url",
				"https://foo.bar/baz",
			}),
			makeNullableInt64(alloc, []int64{10, 0, 30, 0}, []bool{true, false, true, false}),
		})
	defer batch.Release()

	// ── 1. Comparison operators ──────────────────────────────────────
	t.Run("comparisons", func(t *testing.T) {
		tests := []struct {
			expr     string
			expected []bool
		}{
			{"amount > 100", []bool{false, true, false, true}},
			{"amount >= 100", []bool{false, true, true, true}},
			{"amount < 100", []bool{true, false, false, false}},
			{"amount <= 100", []bool{true, false, true, false}},
			{"amount = 100", []bool{false, false, true, false}},
			{"amount != 100", []bool{true, true, false, true}},
			{"country = 'US'", []bool{true, false, true, false}},
		}

		for _, tt := range tests {
			result, err := ev.EvalBool(ctx, batch, tt.expr)
			if err != nil {
				t.Fatalf("%s: %v", tt.expr, err)
			}
			for i, exp := range tt.expected {
				if result.Value(i) != exp {
					t.Errorf("%s [%d]: got %v, want %v", tt.expr, i, result.Value(i), exp)
				}
			}
			result.Release()
		}
	})

	// ── 2. Arithmetic operators ──────────────────────────────────────
	t.Run("arithmetic", func(t *testing.T) {
		// Addition
		result, err := ev.Eval(ctx, batch, "amount + 10")
		if err != nil {
			t.Fatal(err)
		}
		ints := result.(*array.Int64)
		wantAdd := []int64{60, 160, 110, 210}
		for i, w := range wantAdd {
			if ints.Value(i) != w {
				t.Errorf("amount + 10 [%d]: got %d, want %d", i, ints.Value(i), w)
			}
		}
		result.Release()

		// Subtraction
		result, err = ev.Eval(ctx, batch, "amount - 50")
		if err != nil {
			t.Fatal(err)
		}
		ints = result.(*array.Int64)
		wantSub := []int64{0, 100, 50, 150}
		for i, w := range wantSub {
			if ints.Value(i) != w {
				t.Errorf("amount - 50 [%d]: got %d, want %d", i, ints.Value(i), w)
			}
		}
		result.Release()

		// Multiplication
		result, err = ev.Eval(ctx, batch, "amount * 2")
		if err != nil {
			t.Fatal(err)
		}
		ints = result.(*array.Int64)
		wantMul := []int64{100, 300, 200, 400}
		for i, w := range wantMul {
			if ints.Value(i) != w {
				t.Errorf("amount * 2 [%d]: got %d, want %d", i, ints.Value(i), w)
			}
		}
		result.Release()
	})

	// ── 3. String functions ──────────────────────────────────────────
	t.Run("UPPER", func(t *testing.T) {
		result, err := ev.Eval(ctx, batch, "UPPER(name)")
		if err != nil {
			t.Fatal(err)
		}
		defer result.Release()

		s := result.(*array.String)
		want := []string{"ALICE", "BOB", " CHARLIE ", "DAVE"}
		for i, w := range want {
			if s.Value(i) != w {
				t.Errorf("UPPER [%d]: got %q, want %q", i, s.Value(i), w)
			}
		}
	})

	t.Run("LOWER", func(t *testing.T) {
		result, err := ev.Eval(ctx, batch, "LOWER(name)")
		if err != nil {
			t.Fatal(err)
		}
		defer result.Release()

		s := result.(*array.String)
		want := []string{"alice", "bob", " charlie ", "dave"}
		for i, w := range want {
			if s.Value(i) != w {
				t.Errorf("LOWER [%d]: got %q, want %q", i, s.Value(i), w)
			}
		}
	})

	t.Run("TRIM", func(t *testing.T) {
		result, err := ev.Eval(ctx, batch, "TRIM(name)")
		if err != nil {
			t.Fatal(err)
		}
		defer result.Release()

		s := result.(*array.String)
		want := []string{"alice", "Bob", "charlie", "dave"}
		for i, w := range want {
			if s.Value(i) != w {
				t.Errorf("TRIM [%d]: got %q, want %q", i, s.Value(i), w)
			}
		}
	})

	// ── 4. COALESCE ──────────────────────────────────────────────────
	t.Run("COALESCE", func(t *testing.T) {
		result, err := ev.Eval(ctx, batch, "COALESCE(nullable_val, -1)")
		if err != nil {
			t.Fatal(err)
		}
		defer result.Release()

		ints := result.(*array.Int64)
		want := []int64{10, -1, 30, -1}
		for i, w := range want {
			if ints.Value(i) != w {
				t.Errorf("COALESCE [%d]: got %d, want %d", i, ints.Value(i), w)
			}
		}
	})

	// ── 5. CASE WHEN ─────────────────────────────────────────────────
	t.Run("CASE_WHEN", func(t *testing.T) {
		result, err := ev.Eval(ctx, batch,
			"CASE WHEN amount > 150 THEN 'high' WHEN amount > 75 THEN 'medium' ELSE 'low' END")
		if err != nil {
			t.Fatal(err)
		}
		defer result.Release()

		s := result.(*array.String)
		want := []string{"low", "medium", "medium", "high"}
		for i, w := range want {
			if s.Value(i) != w {
				t.Errorf("CASE WHEN [%d]: got %q, want %q", i, s.Value(i), w)
			}
		}
	})

	// ── 6. REGEXP_EXTRACT ────────────────────────────────────────────
	t.Run("REGEXP_EXTRACT", func(t *testing.T) {
		result, err := ev.Eval(ctx, batch, "REGEXP_EXTRACT(url, 'https?://([^/]+)', 1)")
		if err != nil {
			t.Fatal(err)
		}
		defer result.Release()

		s := result.(*array.String)
		// Row 0: example.com, Row 1: test.org, Row 2: null (no match), Row 3: foo.bar
		if s.Value(0) != "example.com" {
			t.Errorf("REGEXP_EXTRACT [0]: got %q, want %q", s.Value(0), "example.com")
		}
		if s.Value(1) != "test.org" {
			t.Errorf("REGEXP_EXTRACT [1]: got %q, want %q", s.Value(1), "test.org")
		}
		if !s.IsNull(2) {
			t.Errorf("REGEXP_EXTRACT [2]: expected null, got %q", s.Value(2))
		}
		if s.Value(3) != "foo.bar" {
			t.Errorf("REGEXP_EXTRACT [3]: got %q, want %q", s.Value(3), "foo.bar")
		}
	})

	// ── 7. IS NULL / IS NOT NULL ─────────────────────────────────────
	t.Run("IS_NULL", func(t *testing.T) {
		result, err := ev.EvalBool(ctx, batch, "nullable_val IS NULL")
		if err != nil {
			t.Fatal(err)
		}
		defer result.Release()

		want := []bool{false, true, false, true}
		for i, w := range want {
			if result.Value(i) != w {
				t.Errorf("IS NULL [%d]: got %v, want %v", i, result.Value(i), w)
			}
		}
	})

	t.Run("IS_NOT_NULL", func(t *testing.T) {
		result, err := ev.EvalBool(ctx, batch, "nullable_val IS NOT NULL")
		if err != nil {
			t.Fatal(err)
		}
		defer result.Release()

		want := []bool{true, false, true, false}
		for i, w := range want {
			if result.Value(i) != w {
				t.Errorf("IS NOT NULL [%d]: got %v, want %v", i, result.Value(i), w)
			}
		}
	})

	// ── 8. Logical operators ─────────────────────────────────────────
	t.Run("AND", func(t *testing.T) {
		result, err := ev.EvalBool(ctx, batch, "amount > 100 AND country = 'CA'")
		if err != nil {
			t.Fatal(err)
		}
		defer result.Release()

		want := []bool{false, false, false, true}
		for i, w := range want {
			if result.Value(i) != w {
				t.Errorf("AND [%d]: got %v, want %v", i, result.Value(i), w)
			}
		}
	})

	t.Run("OR", func(t *testing.T) {
		result, err := ev.EvalBool(ctx, batch, "amount < 75 OR country = 'UK'")
		if err != nil {
			t.Fatal(err)
		}
		defer result.Release()

		want := []bool{true, true, false, false}
		for i, w := range want {
			if result.Value(i) != w {
				t.Errorf("OR [%d]: got %v, want %v", i, result.Value(i), w)
			}
		}
	})
}

// ── Additional test helpers ──────────────────────────────────────────

func makeNullableInt64(alloc memory.Allocator, vals []int64, valid []bool) arrow.Array {
	bldr := array.NewInt64Builder(alloc)
	defer bldr.Release()
	bldr.AppendValues(vals, valid)
	return bldr.NewArray()
}
