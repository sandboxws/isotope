package operators

import (
	"fmt"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"
	"github.com/apache/arrow-go/v18/arrow/memory"

	"github.com/sandboxws/isotope/runtime/pkg/operator"
)

// CastColumn specifies a column to cast and its target Arrow type.
type CastColumn struct {
	Name       string
	TargetType arrow.DataType
}

// Cast converts specified columns to new Arrow types.
type Cast struct {
	columns []CastColumn
	alloc   memory.Allocator
}

// NewCast creates a Cast operator.
func NewCast(columns []CastColumn) *Cast {
	return &Cast{columns: columns}
}

func (c *Cast) Open(ctx *operator.Context) error {
	c.alloc = ctx.Alloc
	return nil
}

func (c *Cast) ProcessBatch(batch arrow.Record) ([]arrow.Record, error) {
	// Build a lookup of column name -> target type.
	castMap := make(map[string]arrow.DataType, len(c.columns))
	for _, col := range c.columns {
		castMap[col.Name] = col.TargetType
	}

	schema := batch.Schema()
	newFields := make([]arrow.Field, schema.NumFields())
	newArrays := make([]arrow.Array, schema.NumFields())
	var toRelease []arrow.Array

	for i := 0; i < schema.NumFields(); i++ {
		f := schema.Field(i)
		col := batch.Column(i)

		target, needsCast := castMap[f.Name]
		if !needsCast || col.DataType().ID() == target.ID() {
			newFields[i] = f
			newArrays[i] = col
			continue
		}

		casted, err := castArrayToType(c.alloc, col, target)
		if err != nil {
			for _, a := range toRelease {
				a.Release()
			}
			return nil, fmt.Errorf("cast column %q to %s: %w", f.Name, target, err)
		}
		newFields[i] = arrow.Field{Name: f.Name, Type: target, Nullable: f.Nullable}
		newArrays[i] = casted
		toRelease = append(toRelease, casted)
	}

	newSchema := arrow.NewSchema(newFields, nil)
	result := array.NewRecord(newSchema, newArrays, batch.NumRows())
	// NewRecord retains, so release our cast references.
	for _, a := range toRelease {
		a.Release()
	}
	return []arrow.Record{result}, nil
}

func (c *Cast) ProcessWatermark(_ operator.Watermark) error                { return nil }
func (c *Cast) ProcessCheckpointBarrier(_ operator.CheckpointBarrier) error { return nil }
func (c *Cast) Close() error                                              { return nil }

// castArrayToType performs a manual element-wise cast.
func castArrayToType(alloc memory.Allocator, arr arrow.Array, target arrow.DataType) (arrow.Array, error) {
	n := arr.Len()

	switch target.ID() {
	case arrow.INT64:
		bldr := array.NewInt64Builder(alloc)
		defer bldr.Release()
		for i := 0; i < n; i++ {
			if arr.IsNull(i) {
				bldr.AppendNull()
				continue
			}
			bldr.Append(toInt64(arr, i))
		}
		return bldr.NewArray(), nil

	case arrow.FLOAT64:
		bldr := array.NewFloat64Builder(alloc)
		defer bldr.Release()
		for i := 0; i < n; i++ {
			if arr.IsNull(i) {
				bldr.AppendNull()
				continue
			}
			bldr.Append(toFloat64(arr, i))
		}
		return bldr.NewArray(), nil

	case arrow.STRING:
		bldr := array.NewStringBuilder(alloc)
		defer bldr.Release()
		for i := 0; i < n; i++ {
			if arr.IsNull(i) {
				bldr.AppendNull()
				continue
			}
			bldr.Append(toString(arr, i))
		}
		return bldr.NewArray(), nil

	case arrow.BOOL:
		bldr := array.NewBooleanBuilder(alloc)
		defer bldr.Release()
		for i := 0; i < n; i++ {
			if arr.IsNull(i) {
				bldr.AppendNull()
				continue
			}
			bldr.Append(toBool(arr, i))
		}
		return bldr.NewArray(), nil

	default:
		return nil, fmt.Errorf("unsupported cast target type: %s", target)
	}
}

func toInt64(arr arrow.Array, i int) int64 {
	switch a := arr.(type) {
	case *array.Int8:
		return int64(a.Value(i))
	case *array.Int16:
		return int64(a.Value(i))
	case *array.Int32:
		return int64(a.Value(i))
	case *array.Int64:
		return a.Value(i)
	case *array.Float32:
		return int64(a.Value(i))
	case *array.Float64:
		return int64(a.Value(i))
	default:
		return 0
	}
}

func toFloat64(arr arrow.Array, i int) float64 {
	switch a := arr.(type) {
	case *array.Int8:
		return float64(a.Value(i))
	case *array.Int16:
		return float64(a.Value(i))
	case *array.Int32:
		return float64(a.Value(i))
	case *array.Int64:
		return float64(a.Value(i))
	case *array.Float32:
		return float64(a.Value(i))
	case *array.Float64:
		return a.Value(i)
	default:
		return 0
	}
}

func toString(arr arrow.Array, i int) string {
	switch a := arr.(type) {
	case *array.String:
		return a.Value(i)
	case *array.Int64:
		return fmt.Sprintf("%d", a.Value(i))
	case *array.Float64:
		return fmt.Sprintf("%g", a.Value(i))
	case *array.Boolean:
		if a.Value(i) {
			return "true"
		}
		return "false"
	default:
		return ""
	}
}

func toBool(arr arrow.Array, i int) bool {
	switch a := arr.(type) {
	case *array.Boolean:
		return a.Value(i)
	case *array.Int64:
		return a.Value(i) != 0
	default:
		return false
	}
}
