// Command ysb-bench runs the YSB pipeline using Go operators directly,
// without the plan/protobuf layer. Used for comparison benchmarking.
//
// Pipeline: Generator → Filter(view) → Map(ad_id, event_time) → Console
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"
	"github.com/apache/arrow-go/v18/arrow/memory"

	"github.com/sandboxws/isotope/runtime/pkg/expr"
)

func main() {
	alloc := memory.DefaultAllocator

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		cancel()
	}()

	// Build schema matching YSB ad-event.
	schema := arrow.NewSchema([]arrow.Field{
		{Name: "ad_id", Type: arrow.BinaryTypes.String},
		{Name: "ad_type", Type: arrow.BinaryTypes.String},
		{Name: "event_type", Type: arrow.BinaryTypes.String},
		{Name: "event_time", Type: arrow.PrimitiveTypes.Int64},
		{Name: "ip_address", Type: arrow.BinaryTypes.String},
	}, nil)

	// Generate synthetic data.
	batchSize := 4096
	var totalProcessed atomic.Int64

	// Throughput reporter.
	go func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		var last int64
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				cur := totalProcessed.Load()
				delta := cur - last
				last = cur
				slog.Info("throughput", "events/sec", delta, "total", cur)
			}
		}
	}()

	// Create evaluator for filter expressions.
	evaluator := expr.NewEvaluator(alloc)

	slog.Info("starting YSB Go benchmark", "batch_size", batchSize)

	for {
		select {
		case <-ctx.Done():
			slog.Info("benchmark stopped", "total", totalProcessed.Load())
			return
		default:
		}

		batch := generateBatch(alloc, schema, batchSize)

		// Filter: event_type = 'view'
		mask, err := evaluator.EvalBool(ctx, batch, "event_type = 'view'")
		if err != nil {
			slog.Error("filter eval failed", "error", err)
			batch.Release()
			continue
		}

		filtered := filterBatch(alloc, batch, mask)
		batch.Release()
		mask.Release()

		if filtered.NumRows() > 0 {
			// Map: project ad_id and event_time
			projected := projectBatch(alloc, filtered, []string{"ad_id", "event_time"})
			projected.Release()
		}
		filtered.Release()

		totalProcessed.Add(int64(batchSize))
	}
}

var campaigns = func() []string {
	c := make([]string, 100)
	for i := range c {
		c[i] = fmt.Sprintf("campaign_%04d", i)
	}
	return c
}()

var eventTypesArr = []string{"view", "view", "view", "view", "click"} // ~80% view

func generateBatch(alloc memory.Allocator, schema *arrow.Schema, n int) arrow.Record {
	adIDBldr := array.NewStringBuilder(alloc)
	adTypeBldr := array.NewStringBuilder(alloc)
	eventTypeBldr := array.NewStringBuilder(alloc)
	eventTimeBldr := array.NewInt64Builder(alloc)
	ipBldr := array.NewStringBuilder(alloc)

	now := time.Now().UnixMilli()
	for i := 0; i < n; i++ {
		adIDBldr.Append(campaigns[i%len(campaigns)])
		adTypeBldr.Append("banner")
		eventTypeBldr.Append(eventTypesArr[i%len(eventTypesArr)])
		eventTimeBldr.Append(now + int64(i))
		ipBldr.Append("10.0.0.1")
	}

	arrays := []arrow.Array{
		adIDBldr.NewArray(),
		adTypeBldr.NewArray(),
		eventTypeBldr.NewArray(),
		eventTimeBldr.NewArray(),
		ipBldr.NewArray(),
	}
	adIDBldr.Release()
	adTypeBldr.Release()
	eventTypeBldr.Release()
	eventTimeBldr.Release()
	ipBldr.Release()

	rec := array.NewRecord(schema, arrays, int64(n))
	for _, a := range arrays {
		a.Release()
	}
	return rec
}

func filterBatch(alloc memory.Allocator, batch arrow.Record, mask *array.Boolean) arrow.Record {
	n := int(batch.NumRows())
	builders := make([]array.Builder, batch.NumCols())
	for i := 0; i < int(batch.NumCols()); i++ {
		builders[i] = array.NewBuilder(alloc, batch.Schema().Field(i).Type)
	}

	for row := 0; row < n; row++ {
		if mask.IsValid(row) && mask.Value(row) {
			for col := 0; col < int(batch.NumCols()); col++ {
				appendFromArray(builders[col], batch.Column(col), row)
			}
		}
	}

	arrays := make([]arrow.Array, len(builders))
	count := 0
	if len(builders) > 0 {
		arrays[0] = builders[0].NewArray()
		count = arrays[0].Len()
		builders[0].Release()
		for i := 1; i < len(builders); i++ {
			arrays[i] = builders[i].NewArray()
			builders[i].Release()
		}
	}

	schema := batch.Schema()
	rec := array.NewRecord(schema, arrays, int64(count))
	for _, a := range arrays {
		a.Release()
	}
	return rec
}

func projectBatch(alloc memory.Allocator, batch arrow.Record, cols []string) arrow.Record {
	schema := batch.Schema()
	fields := make([]arrow.Field, len(cols))
	arrays := make([]arrow.Array, len(cols))
	for i, name := range cols {
		idx := -1
		for j := 0; j < schema.NumFields(); j++ {
			if schema.Field(j).Name == name {
				idx = j
				break
			}
		}
		if idx < 0 {
			continue
		}
		fields[i] = schema.Field(idx)
		arrays[i] = batch.Column(idx)
		arrays[i].Retain()
	}
	outSchema := arrow.NewSchema(fields, nil)
	rec := array.NewRecord(outSchema, arrays, batch.NumRows())
	for _, a := range arrays {
		a.Release()
	}
	return rec
}

func appendFromArray(builder array.Builder, arr arrow.Array, row int) {
	if arr.IsNull(row) {
		builder.AppendNull()
		return
	}
	switch a := arr.(type) {
	case *array.String:
		builder.(*array.StringBuilder).Append(a.Value(row))
	case *array.Int64:
		builder.(*array.Int64Builder).Append(a.Value(row))
	case *array.Float64:
		builder.(*array.Float64Builder).Append(a.Value(row))
	case *array.Boolean:
		builder.(*array.BooleanBuilder).Append(a.Value(row))
	default:
		builder.AppendNull()
	}
}
