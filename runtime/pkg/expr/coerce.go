package expr

import (
	"fmt"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"
	"github.com/apache/arrow-go/v18/arrow/memory"
)

// coerceTypes promotes two arrays to a common type following SQL rules:
// Int8/Int16/Int32 + Int64 -> Int64, Int + Float -> Float64, etc.
// Returns potentially new arrays (caller must release originals separately).
func coerceTypes(alloc memory.Allocator, left, right arrow.Array) (arrow.Array, arrow.Array, error) {
	lt := left.DataType().ID()
	rt := right.DataType().ID()

	if lt == rt {
		left.Retain()
		right.Retain()
		return left, right, nil
	}

	target := promoteType(lt, rt)
	if target == arrow.NULL {
		// No coercion needed or possible — return as-is.
		left.Retain()
		right.Retain()
		return left, right, nil
	}

	newLeft, err := castArray(alloc, left, target)
	if err != nil {
		return nil, nil, fmt.Errorf("coerce left to %s: %w", target, err)
	}

	newRight, err := castArray(alloc, right, target)
	if err != nil {
		newLeft.Release()
		return nil, nil, fmt.Errorf("coerce right to %s: %w", target, err)
	}

	return newLeft, newRight, nil
}

// promoteType returns the common type for two Arrow type IDs.
func promoteType(a, b arrow.Type) arrow.Type {
	rank := typeRank(a)
	otherRank := typeRank(b)

	if rank < 0 || otherRank < 0 {
		return arrow.NULL // Can't promote.
	}

	if rank > otherRank {
		return rankToType(rank)
	}
	return rankToType(otherRank)
}

// typeRank assigns a promotion rank to numeric types.
func typeRank(t arrow.Type) int {
	switch t {
	case arrow.INT8:
		return 1
	case arrow.INT16:
		return 2
	case arrow.INT32:
		return 3
	case arrow.INT64:
		return 4
	case arrow.FLOAT32:
		return 5
	case arrow.FLOAT64:
		return 6
	default:
		return -1
	}
}

func rankToType(rank int) arrow.Type {
	switch rank {
	case 1:
		return arrow.INT8
	case 2:
		return arrow.INT16
	case 3:
		return arrow.INT32
	case 4:
		return arrow.INT64
	case 5:
		return arrow.FLOAT32
	case 6:
		return arrow.FLOAT64
	default:
		return arrow.NULL
	}
}

// castArray casts an array to the target type.
func castArray(alloc memory.Allocator, arr arrow.Array, target arrow.Type) (arrow.Array, error) {
	if arr.DataType().ID() == target {
		arr.Retain()
		return arr, nil
	}

	n := arr.Len()

	switch target {
	case arrow.INT64:
		return castToInt64(alloc, arr, n)
	case arrow.FLOAT64:
		return castToFloat64(alloc, arr, n)
	default:
		return nil, fmt.Errorf("unsupported cast target: %s", target)
	}
}

func castToInt64(alloc memory.Allocator, arr arrow.Array, n int) (arrow.Array, error) {
	bldr := array.NewInt64Builder(alloc)
	defer bldr.Release()

	for i := 0; i < n; i++ {
		if arr.IsNull(i) {
			bldr.AppendNull()
			continue
		}
		bldr.Append(intValue(arr, i))
	}
	return bldr.NewArray(), nil
}

func castToFloat64(alloc memory.Allocator, arr arrow.Array, n int) (arrow.Array, error) {
	bldr := array.NewFloat64Builder(alloc)
	defer bldr.Release()

	for i := 0; i < n; i++ {
		if arr.IsNull(i) {
			bldr.AppendNull()
			continue
		}
		switch a := arr.(type) {
		case *array.Int8:
			bldr.Append(float64(a.Value(i)))
		case *array.Int16:
			bldr.Append(float64(a.Value(i)))
		case *array.Int32:
			bldr.Append(float64(a.Value(i)))
		case *array.Int64:
			bldr.Append(float64(a.Value(i)))
		case *array.Float32:
			bldr.Append(float64(a.Value(i)))
		case *array.Float64:
			bldr.Append(a.Value(i))
		default:
			return nil, fmt.Errorf("cannot cast %T to float64", arr)
		}
	}
	return bldr.NewArray(), nil
}
