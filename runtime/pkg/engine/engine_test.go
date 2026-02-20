// Package engine integration tests: build and run a complete operator DAG.
package engine

import (
	"bytes"
	"context"
	"strings"
	"testing"
	"time"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"
	"github.com/apache/arrow-go/v18/arrow/memory"
	"google.golang.org/protobuf/proto"

	pb "github.com/sandboxws/isotope/runtime/internal/proto/isotope/v1"
	"github.com/sandboxws/isotope/runtime/pkg/connectors"
	"github.com/sandboxws/isotope/runtime/pkg/operator"
	"github.com/sandboxws/isotope/runtime/pkg/operators"
)

// TestE2EGeneratorFilterMapConsole runs a full pipeline:
// Generator(100 rows) → Filter(id >= 50) → Map(double_id = id * 2) → Console
func TestE2EGeneratorFilterMapConsole(t *testing.T) {
	alloc := memory.NewCheckedAllocator(memory.DefaultAllocator)
	defer alloc.AssertSize(t, 0)

	schema := &pb.Schema{
		Fields: []*pb.SchemaField{
			{Name: "id", ArrowType: pb.ArrowType_ARROW_TYPE_INT64},
			{Name: "name", ArrowType: pb.ArrowType_ARROW_TYPE_STRING},
		},
	}

	plan := &pb.ExecutionPlan{
		PipelineName:       "e2e-test",
		DefaultParallelism: 1,
		Mode:               pb.PipelineMode_PIPELINE_MODE_STREAMING,
		Operators: []*pb.OperatorNode{
			{
				Id:           "src",
				Name:         "generator",
				OperatorType: pb.OperatorType_OPERATOR_TYPE_GENERATOR_SOURCE,
				OutputSchema: schema,
			},
			{
				Id:           "filter",
				Name:         "filter",
				OperatorType: pb.OperatorType_OPERATOR_TYPE_FILTER,
				InputSchema:  schema,
				OutputSchema: schema,
			},
			{
				Id:           "mapper",
				Name:         "map",
				OperatorType: pb.OperatorType_OPERATOR_TYPE_MAP,
				InputSchema:  schema,
				OutputSchema: &pb.Schema{
					Fields: []*pb.SchemaField{
						{Name: "double_id", ArrowType: pb.ArrowType_ARROW_TYPE_INT64},
						{Name: "upper_name", ArrowType: pb.ArrowType_ARROW_TYPE_STRING},
					},
				},
			},
			{
				Id:           "sink",
				Name:         "console",
				OperatorType: pb.OperatorType_OPERATOR_TYPE_CONSOLE_SINK,
			},
		},
		Edges: []*pb.Edge{
			{FromOperator: "src", ToOperator: "filter", Shuffle: pb.ShuffleStrategy_SHUFFLE_STRATEGY_FORWARD},
			{FromOperator: "filter", ToOperator: "mapper", Shuffle: pb.ShuffleStrategy_SHUFFLE_STRATEGY_FORWARD},
			{FromOperator: "mapper", ToOperator: "sink", Shuffle: pb.ShuffleStrategy_SHUFFLE_STRATEGY_FORWARD},
		},
	}

	// Capture console output.
	var buf bytes.Buffer

	factory := func(node *pb.OperatorNode) (interface{}, error) {
		switch node.OperatorType {
		case pb.OperatorType_OPERATOR_TYPE_GENERATOR_SOURCE:
			return connectors.NewGenerator(schema, 100000, 100), nil
		case pb.OperatorType_OPERATOR_TYPE_FILTER:
			return operators.NewFilter("id >= 50"), nil
		case pb.OperatorType_OPERATOR_TYPE_MAP:
			return operators.NewMap(map[string]string{
				"double_id":  "id * 2",
				"upper_name": "UPPER(name)",
			}), nil
		case pb.OperatorType_OPERATOR_TYPE_CONSOLE_SINK:
			c := connectors.NewConsole(0)
			c.SetWriter(&buf)
			return c, nil
		default:
			t.Fatalf("unexpected operator type: %v", node.OperatorType)
			return nil, nil
		}
	}

	eng := NewEngine(plan, alloc, factory)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := eng.Run(ctx); err != nil {
		t.Fatal(err)
	}

	output := buf.String()
	if len(output) == 0 {
		t.Fatal("expected console output, got empty string")
	}

	// The output should contain "double_id" and "upper_name" headers.
	if !strings.Contains(output, "double_id") {
		t.Errorf("expected output to contain 'double_id' header, got:\n%s", truncate(output, 500))
	}
	if !strings.Contains(output, "upper_name") {
		t.Errorf("expected output to contain 'upper_name' header, got:\n%s", truncate(output, 500))
	}
}

// TestE2EValidatorRejectsCycle verifies that the engine rejects a plan with a cycle.
func TestE2EValidatorRejectsCycle(t *testing.T) {
	plan := &pb.ExecutionPlan{
		PipelineName: "cycle-test",
		Operators: []*pb.OperatorNode{
			{Id: "a", Name: "a", OperatorType: pb.OperatorType_OPERATOR_TYPE_FILTER},
			{Id: "b", Name: "b", OperatorType: pb.OperatorType_OPERATOR_TYPE_FILTER},
		},
		Edges: []*pb.Edge{
			{FromOperator: "a", ToOperator: "b", Shuffle: pb.ShuffleStrategy_SHUFFLE_STRATEGY_FORWARD},
			{FromOperator: "b", ToOperator: "a", Shuffle: pb.ShuffleStrategy_SHUFFLE_STRATEGY_FORWARD},
		},
	}

	factory := func(node *pb.OperatorNode) (interface{}, error) {
		return operators.NewFilter("1 = 1"), nil
	}

	eng := NewEngine(plan, memory.DefaultAllocator, factory)

	err := eng.Run(context.Background())
	if err == nil {
		t.Fatal("expected error for cyclic plan, got nil")
	}
	if !strings.Contains(err.Error(), "cycle") {
		t.Errorf("expected cycle error, got: %v", err)
	}
}

// TestE2EEmptyPlanRejected verifies that the engine rejects an empty plan.
func TestE2EEmptyPlanRejected(t *testing.T) {
	plan := &pb.ExecutionPlan{
		PipelineName: "empty-test",
	}

	eng := NewEngine(plan, memory.DefaultAllocator, nil)
	err := eng.Run(context.Background())
	if err == nil {
		t.Fatal("expected error for empty plan, got nil")
	}
}

// TestE2EPlanSerializationRoundtrip verifies that a plan can be serialized and deserialized.
func TestE2EPlanSerializationRoundtrip(t *testing.T) {
	plan := &pb.ExecutionPlan{
		PipelineName:       "roundtrip-test",
		DefaultParallelism: 4,
		Mode:               pb.PipelineMode_PIPELINE_MODE_STREAMING,
		Operators: []*pb.OperatorNode{
			{
				Id:           "src",
				Name:         "generator",
				OperatorType: pb.OperatorType_OPERATOR_TYPE_GENERATOR_SOURCE,
				OutputSchema: &pb.Schema{
					Fields: []*pb.SchemaField{
						{Name: "id", ArrowType: pb.ArrowType_ARROW_TYPE_INT64},
					},
				},
			},
			{
				Id:           "sink",
				Name:         "console",
				OperatorType: pb.OperatorType_OPERATOR_TYPE_CONSOLE_SINK,
			},
		},
		Edges: []*pb.Edge{
			{FromOperator: "src", ToOperator: "sink", Shuffle: pb.ShuffleStrategy_SHUFFLE_STRATEGY_FORWARD},
		},
	}

	// Serialize.
	data, err := proto.Marshal(plan)
	if err != nil {
		t.Fatal(err)
	}

	if len(data) == 0 {
		t.Fatal("serialized plan is empty")
	}

	// Deserialize.
	restored, err := DeserializePlan(data)
	if err != nil {
		t.Fatal(err)
	}

	if restored.PipelineName != "roundtrip-test" {
		t.Errorf("expected pipeline name 'roundtrip-test', got %q", restored.PipelineName)
	}
	if restored.DefaultParallelism != 4 {
		t.Errorf("expected parallelism 4, got %d", restored.DefaultParallelism)
	}
	if len(restored.Operators) != 2 {
		t.Errorf("expected 2 operators, got %d", len(restored.Operators))
	}
	if len(restored.Edges) != 1 {
		t.Errorf("expected 1 edge, got %d", len(restored.Edges))
	}
}

// TestE2EOperatorChaining tests that FORWARD-connected operators are fused into chains.
func TestE2EOperatorChaining(t *testing.T) {
	alloc := memory.NewCheckedAllocator(memory.DefaultAllocator)
	defer alloc.AssertSize(t, 0)

	schema := &pb.Schema{
		Fields: []*pb.SchemaField{
			{Name: "x", ArrowType: pb.ArrowType_ARROW_TYPE_INT64},
		},
	}

	plan := &pb.ExecutionPlan{
		PipelineName: "chain-test",
		Operators: []*pb.OperatorNode{
			{Id: "src", Name: "gen", OperatorType: pb.OperatorType_OPERATOR_TYPE_GENERATOR_SOURCE, OutputSchema: schema},
			{Id: "f1", Name: "filter1", OperatorType: pb.OperatorType_OPERATOR_TYPE_FILTER, InputSchema: schema, OutputSchema: schema},
			{Id: "f2", Name: "filter2", OperatorType: pb.OperatorType_OPERATOR_TYPE_FILTER, InputSchema: schema, OutputSchema: schema},
			{Id: "sink", Name: "console", OperatorType: pb.OperatorType_OPERATOR_TYPE_CONSOLE_SINK},
		},
		Edges: []*pb.Edge{
			{FromOperator: "src", ToOperator: "f1", Shuffle: pb.ShuffleStrategy_SHUFFLE_STRATEGY_FORWARD},
			{FromOperator: "f1", ToOperator: "f2", Shuffle: pb.ShuffleStrategy_SHUFFLE_STRATEGY_FORWARD},
			{FromOperator: "f2", ToOperator: "sink", Shuffle: pb.ShuffleStrategy_SHUFFLE_STRATEGY_FORWARD},
		},
	}

	var buf bytes.Buffer
	factory := func(node *pb.OperatorNode) (interface{}, error) {
		switch node.OperatorType {
		case pb.OperatorType_OPERATOR_TYPE_GENERATOR_SOURCE:
			return connectors.NewGenerator(schema, 100000, 50), nil
		case pb.OperatorType_OPERATOR_TYPE_FILTER:
			return operators.NewFilter("x >= 0"), nil
		case pb.OperatorType_OPERATOR_TYPE_CONSOLE_SINK:
			c := connectors.NewConsole(0)
			c.SetWriter(&buf)
			return c, nil
		default:
			return nil, nil
		}
	}

	eng := NewEngine(plan, alloc, factory)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := eng.Run(ctx); err != nil {
		t.Fatal(err)
	}

	if buf.Len() == 0 {
		t.Fatal("expected console output from chained pipeline")
	}
}

// ── Collecting sink for verification ────────────────────────────────

// collectingSink stores all received batches for inspection.
type collectingSink struct {
	batches []arrow.Record
	alloc   memory.Allocator
}

func (s *collectingSink) Open(ctx *operator.Context) error {
	s.alloc = ctx.Alloc
	return nil
}

func (s *collectingSink) WriteBatch(batch arrow.Record) error {
	batch.Retain()
	s.batches = append(s.batches, batch)
	return nil
}

func (s *collectingSink) Close() error { return nil }

func (s *collectingSink) TotalRows() int64 {
	var total int64
	for _, b := range s.batches {
		total += b.NumRows()
	}
	return total
}

func (s *collectingSink) ReleaseAll() {
	for _, b := range s.batches {
		b.Release()
	}
	s.batches = nil
}

// TestE2EGeneratorToCollectingSink verifies data flows through to a collecting sink.
func TestE2EGeneratorToCollectingSink(t *testing.T) {
	alloc := memory.NewCheckedAllocator(memory.DefaultAllocator)
	defer alloc.AssertSize(t, 0)

	schema := &pb.Schema{
		Fields: []*pb.SchemaField{
			{Name: "id", ArrowType: pb.ArrowType_ARROW_TYPE_INT64},
		},
	}

	plan := &pb.ExecutionPlan{
		PipelineName: "collect-test",
		Operators: []*pb.OperatorNode{
			{Id: "src", Name: "gen", OperatorType: pb.OperatorType_OPERATOR_TYPE_GENERATOR_SOURCE, OutputSchema: schema},
			{Id: "sink", Name: "collect", OperatorType: pb.OperatorType_OPERATOR_TYPE_CONSOLE_SINK},
		},
		Edges: []*pb.Edge{
			{FromOperator: "src", ToOperator: "sink", Shuffle: pb.ShuffleStrategy_SHUFFLE_STRATEGY_FORWARD},
		},
	}

	collector := &collectingSink{}
	factory := func(node *pb.OperatorNode) (interface{}, error) {
		switch node.OperatorType {
		case pb.OperatorType_OPERATOR_TYPE_GENERATOR_SOURCE:
			return connectors.NewGenerator(schema, 100000, 100), nil
		case pb.OperatorType_OPERATOR_TYPE_CONSOLE_SINK:
			return collector, nil
		default:
			return nil, nil
		}
	}

	eng := NewEngine(plan, alloc, factory)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := eng.Run(ctx); err != nil {
		t.Fatal(err)
	}
	defer collector.ReleaseAll()

	total := collector.TotalRows()
	if total != 100 {
		t.Errorf("expected 100 rows, got %d", total)
	}

	// Verify data shape.
	for _, batch := range collector.batches {
		if batch.NumCols() != 1 {
			t.Errorf("expected 1 column, got %d", batch.NumCols())
		}
		if batch.Schema().Field(0).Name != "id" {
			t.Errorf("expected column 'id', got %q", batch.Schema().Field(0).Name)
		}
		if batch.Column(0).DataType().ID() != arrow.INT64 {
			t.Errorf("expected INT64, got %s", batch.Column(0).DataType())
		}
	}
}

// TestE2EFilterReducesRows verifies that Filter actually reduces the row count in a full pipeline.
func TestE2EFilterReducesRows(t *testing.T) {
	alloc := memory.NewCheckedAllocator(memory.DefaultAllocator)
	defer alloc.AssertSize(t, 0)

	schema := &pb.Schema{
		Fields: []*pb.SchemaField{
			{Name: "id", ArrowType: pb.ArrowType_ARROW_TYPE_INT64},
		},
	}

	plan := &pb.ExecutionPlan{
		PipelineName: "filter-reduce-test",
		Operators: []*pb.OperatorNode{
			{Id: "src", Name: "gen", OperatorType: pb.OperatorType_OPERATOR_TYPE_GENERATOR_SOURCE, OutputSchema: schema},
			{Id: "filter", Name: "filter", OperatorType: pb.OperatorType_OPERATOR_TYPE_FILTER, InputSchema: schema, OutputSchema: schema},
			{Id: "sink", Name: "collect", OperatorType: pb.OperatorType_OPERATOR_TYPE_CONSOLE_SINK},
		},
		Edges: []*pb.Edge{
			{FromOperator: "src", ToOperator: "filter", Shuffle: pb.ShuffleStrategy_SHUFFLE_STRATEGY_FORWARD},
			{FromOperator: "filter", ToOperator: "sink", Shuffle: pb.ShuffleStrategy_SHUFFLE_STRATEGY_FORWARD},
		},
	}

	collector := &collectingSink{}
	factory := func(node *pb.OperatorNode) (interface{}, error) {
		switch node.OperatorType {
		case pb.OperatorType_OPERATOR_TYPE_GENERATOR_SOURCE:
			// Generate 100 rows with ids 0..99
			return connectors.NewGenerator(schema, 100000, 100), nil
		case pb.OperatorType_OPERATOR_TYPE_FILTER:
			// Keep only ids >= 50 (should be 50 rows: 50..99)
			return operators.NewFilter("id >= 50"), nil
		case pb.OperatorType_OPERATOR_TYPE_CONSOLE_SINK:
			return collector, nil
		default:
			return nil, nil
		}
	}

	eng := NewEngine(plan, alloc, factory)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := eng.Run(ctx); err != nil {
		t.Fatal(err)
	}
	defer collector.ReleaseAll()

	total := collector.TotalRows()
	if total != 50 {
		t.Errorf("expected 50 rows after filter, got %d", total)
	}

	// Verify all ids are >= 50.
	for _, batch := range collector.batches {
		ids := batch.Column(0).(*array.Int64)
		for i := 0; i < ids.Len(); i++ {
			if ids.Value(i) < 50 {
				t.Errorf("expected id >= 50, got %d", ids.Value(i))
			}
		}
	}
}

// ── helpers ─────────────────────────────────────────────────────────

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
