// Package connectors implements source and sink connectors for the Isotope runtime.
package connectors

import (
	"fmt"
	"time"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"
	"github.com/apache/arrow-go/v18/arrow/memory"

	pb "github.com/sandboxws/isotope/runtime/internal/proto/isotope/v1"
	"github.com/sandboxws/isotope/runtime/pkg/operator"
)

const defaultBatchSize = 1024

// Generator produces synthetic Arrow RecordBatches at a configurable rate.
type Generator struct {
	schema        *pb.Schema
	rowsPerSecond int64
	maxRows       int64
	alloc         memory.Allocator
}

// NewGenerator creates a Generator source.
func NewGenerator(schema *pb.Schema, rowsPerSecond, maxRows int64) *Generator {
	return &Generator{
		schema:        schema,
		rowsPerSecond: rowsPerSecond,
		maxRows:       maxRows,
	}
}

func (g *Generator) Open(ctx *operator.Context) error {
	g.alloc = ctx.Alloc
	return nil
}

func (g *Generator) Run(ctx *operator.Context, out chan<- arrow.Record) error {
	defer close(out)

	arrowSchema, err := protoSchemaToArrow(g.schema)
	if err != nil {
		return fmt.Errorf("generator: build schema: %w", err)
	}

	rps := g.rowsPerSecond
	if rps <= 0 {
		rps = 1000
	}

	batchSize := defaultBatchSize
	if int64(batchSize) > rps {
		batchSize = int(rps)
	}

	interval := time.Duration(float64(time.Second) * float64(batchSize) / float64(rps))
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	var totalEmitted int64
	var seq int64

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			remaining := int64(batchSize)
			if g.maxRows > 0 {
				left := g.maxRows - totalEmitted
				if left <= 0 {
					return nil
				}
				if remaining > left {
					remaining = left
				}
			}

			batch := g.generateBatch(arrowSchema, seq, int(remaining))
			select {
			case out <- batch:
				totalEmitted += remaining
				seq += remaining
				ctx.Metrics.BatchesProcessed.Add(1)
				ctx.Metrics.RowsProcessed.Add(remaining)
			case <-ctx.Done():
				batch.Release()
				return nil
			}

			if g.maxRows > 0 && totalEmitted >= g.maxRows {
				return nil
			}
		}
	}
}

func (g *Generator) Close() error { return nil }

func (g *Generator) generateBatch(schema *arrow.Schema, startSeq int64, numRows int) arrow.Record {
	builders := make([]array.Builder, schema.NumFields())
	for i := 0; i < schema.NumFields(); i++ {
		builders[i] = array.NewBuilder(g.alloc, schema.Field(i).Type)
	}

	now := time.Now().UnixMilli()

	for row := 0; row < numRows; row++ {
		seq := startSeq + int64(row)
		for i := 0; i < schema.NumFields(); i++ {
			f := schema.Field(i)
			switch f.Type.ID() {
			case arrow.INT64:
				builders[i].(*array.Int64Builder).Append(seq)
			case arrow.INT32:
				builders[i].(*array.Int32Builder).Append(int32(seq))
			case arrow.FLOAT64:
				builders[i].(*array.Float64Builder).Append(float64(seq) * 1.1)
			case arrow.STRING:
				builders[i].(*array.StringBuilder).Append(fmt.Sprintf("%s_%d", f.Name, seq))
			case arrow.BOOL:
				builders[i].(*array.BooleanBuilder).Append(seq%2 == 0)
			case arrow.TIMESTAMP:
				builders[i].(*array.TimestampBuilder).Append(arrow.Timestamp(now + seq))
			default:
				builders[i].AppendNull()
			}
		}
	}

	arrays := make([]arrow.Array, len(builders))
	for i, b := range builders {
		arrays[i] = b.NewArray()
		b.Release()
	}

	rec := array.NewRecord(schema, arrays, int64(numRows))
	for _, a := range arrays {
		a.Release()
	}
	return rec
}

// protoSchemaToArrow converts a protobuf Schema to an Arrow schema.
func protoSchemaToArrow(s *pb.Schema) (*arrow.Schema, error) {
	if s == nil {
		return nil, fmt.Errorf("nil schema")
	}

	fields := make([]arrow.Field, len(s.Fields))
	for i, f := range s.Fields {
		dt, err := protoTypeToArrow(f.ArrowType)
		if err != nil {
			return nil, fmt.Errorf("field %q: %w", f.Name, err)
		}
		fields[i] = arrow.Field{Name: f.Name, Type: dt, Nullable: f.Nullable}
	}
	return arrow.NewSchema(fields, nil), nil
}

func protoTypeToArrow(t pb.ArrowType) (arrow.DataType, error) {
	switch t {
	case pb.ArrowType_ARROW_TYPE_INT8:
		return arrow.PrimitiveTypes.Int8, nil
	case pb.ArrowType_ARROW_TYPE_INT16:
		return arrow.PrimitiveTypes.Int16, nil
	case pb.ArrowType_ARROW_TYPE_INT32:
		return arrow.PrimitiveTypes.Int32, nil
	case pb.ArrowType_ARROW_TYPE_INT64:
		return arrow.PrimitiveTypes.Int64, nil
	case pb.ArrowType_ARROW_TYPE_FLOAT32:
		return arrow.PrimitiveTypes.Float32, nil
	case pb.ArrowType_ARROW_TYPE_FLOAT64:
		return arrow.PrimitiveTypes.Float64, nil
	case pb.ArrowType_ARROW_TYPE_STRING:
		return arrow.BinaryTypes.String, nil
	case pb.ArrowType_ARROW_TYPE_BOOLEAN:
		return arrow.FixedWidthTypes.Boolean, nil
	case pb.ArrowType_ARROW_TYPE_TIMESTAMP_MS:
		return arrow.FixedWidthTypes.Timestamp_ms, nil
	case pb.ArrowType_ARROW_TYPE_TIMESTAMP_US:
		return arrow.FixedWidthTypes.Timestamp_us, nil
	default:
		return nil, fmt.Errorf("unsupported arrow type: %v", t)
	}
}
