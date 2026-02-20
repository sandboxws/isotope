package connectors

import (
	"bytes"
	"context"
	"strings"
	"testing"
	"time"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"
	"github.com/apache/arrow-go/v18/arrow/memory"

	pb "github.com/sandboxws/isotope/runtime/internal/proto/isotope/v1"
	"github.com/sandboxws/isotope/runtime/pkg/operator"
)

func TestGeneratorMaxRows(t *testing.T) {
	alloc := memory.DefaultAllocator

	schema := &pb.Schema{
		Fields: []*pb.SchemaField{
			{Name: "id", ArrowType: pb.ArrowType_ARROW_TYPE_INT64},
			{Name: "name", ArrowType: pb.ArrowType_ARROW_TYPE_STRING},
		},
	}

	gen := NewGenerator(schema, 100000, 50) // fast rate, max 50 rows
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	opCtx := operator.NewContext(ctx, alloc, "gen", "generator")
	if err := gen.Open(opCtx); err != nil {
		t.Fatal(err)
	}
	defer gen.Close()

	out := make(chan arrow.Record, 100)
	done := make(chan error, 1)
	go func() {
		done <- gen.Run(opCtx, out)
	}()

	var totalRows int64
	for batch := range out {
		totalRows += batch.NumRows()
		batch.Release()
	}

	if err := <-done; err != nil {
		t.Fatal(err)
	}

	if totalRows != 50 {
		t.Errorf("expected 50 total rows, got %d", totalRows)
	}
}

func TestGeneratorSchema(t *testing.T) {
	alloc := memory.DefaultAllocator

	schema := &pb.Schema{
		Fields: []*pb.SchemaField{
			{Name: "id", ArrowType: pb.ArrowType_ARROW_TYPE_INT64},
			{Name: "value", ArrowType: pb.ArrowType_ARROW_TYPE_FLOAT64},
			{Name: "label", ArrowType: pb.ArrowType_ARROW_TYPE_STRING},
			{Name: "flag", ArrowType: pb.ArrowType_ARROW_TYPE_BOOLEAN},
		},
	}

	gen := NewGenerator(schema, 100000, 10)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	opCtx := operator.NewContext(ctx, alloc, "gen", "generator")
	if err := gen.Open(opCtx); err != nil {
		t.Fatal(err)
	}
	defer gen.Close()

	out := make(chan arrow.Record, 100)
	done := make(chan error, 1)
	go func() {
		done <- gen.Run(opCtx, out)
	}()

	var firstBatch arrow.Record
	for batch := range out {
		if firstBatch == nil {
			firstBatch = batch
			firstBatch.Retain()
		}
		batch.Release()
	}
	<-done

	if firstBatch == nil {
		t.Fatal("no batches produced")
	}
	defer firstBatch.Release()

	s := firstBatch.Schema()
	if s.NumFields() != 4 {
		t.Fatalf("expected 4 fields, got %d", s.NumFields())
	}
	if s.Field(0).Type.ID() != arrow.INT64 {
		t.Errorf("expected INT64 for id, got %s", s.Field(0).Type)
	}
	if s.Field(1).Type.ID() != arrow.FLOAT64 {
		t.Errorf("expected FLOAT64 for value, got %s", s.Field(1).Type)
	}
	if s.Field(2).Type.ID() != arrow.STRING {
		t.Errorf("expected STRING for label, got %s", s.Field(2).Type)
	}
	if s.Field(3).Type.ID() != arrow.BOOL {
		t.Errorf("expected BOOL for flag, got %s", s.Field(3).Type)
	}
}

func TestConsole(t *testing.T) {
	alloc := memory.DefaultAllocator

	// Build a test batch.
	fields := []arrow.Field{
		{Name: "id", Type: arrow.PrimitiveTypes.Int64},
		{Name: "name", Type: arrow.BinaryTypes.String},
	}
	schema := arrow.NewSchema(fields, nil)

	idBldr := array.NewInt64Builder(alloc)
	idBldr.AppendValues([]int64{1, 2, 3}, nil)
	idArr := idBldr.NewArray()
	idBldr.Release()

	nameBldr := array.NewStringBuilder(alloc)
	nameBldr.Append("alice")
	nameBldr.Append("bob")
	nameBldr.Append("charlie")
	nameArr := nameBldr.NewArray()
	nameBldr.Release()

	batch := array.NewRecord(schema, []arrow.Array{idArr, nameArr}, 3)
	idArr.Release()
	nameArr.Release()
	defer batch.Release()

	var buf bytes.Buffer
	c := NewConsole(10)
	c.writer = &buf
	if err := c.Open(nil); err != nil {
		t.Fatal(err)
	}
	defer c.Close()

	if err := c.WriteBatch(batch); err != nil {
		t.Fatal(err)
	}

	output := buf.String()
	if !strings.Contains(output, "alice") {
		t.Errorf("output should contain 'alice', got:\n%s", output)
	}
	if !strings.Contains(output, "| id") {
		t.Errorf("output should contain header '| id', got:\n%s", output)
	}
}

func TestConsoleMaxRows(t *testing.T) {
	alloc := memory.DefaultAllocator

	fields := []arrow.Field{
		{Name: "x", Type: arrow.PrimitiveTypes.Int64},
	}
	schema := arrow.NewSchema(fields, nil)

	vals := make([]int64, 100)
	for i := range vals {
		vals[i] = int64(i)
	}
	bldr := array.NewInt64Builder(alloc)
	bldr.AppendValues(vals, nil)
	arr := bldr.NewArray()
	bldr.Release()

	batch := array.NewRecord(schema, []arrow.Array{arr}, 100)
	arr.Release()
	defer batch.Release()

	var buf bytes.Buffer
	c := NewConsole(5) // Only show 5 rows.
	c.writer = &buf
	c.Open(nil)
	defer c.Close()

	c.WriteBatch(batch)

	output := buf.String()
	if !strings.Contains(output, "... (95 more rows)") {
		t.Errorf("expected truncation message, got:\n%s", output)
	}
}
