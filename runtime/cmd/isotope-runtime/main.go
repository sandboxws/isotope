// Command isotope-runtime loads a Protobuf ExecutionPlan and runs it.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/apache/arrow-go/v18/arrow/memory"

	pb "github.com/sandboxws/isotope/runtime/internal/proto/isotope/v1"
	"github.com/sandboxws/isotope/runtime/pkg/engine"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintf(os.Stderr, "usage: isotope-runtime <plan.pb>\n")
		os.Exit(1)
	}

	planPath := os.Args[1]

	// Load and validate the plan.
	plan, err := engine.LoadPlan(planPath)
	if err != nil {
		slog.Error("failed to load plan", "path", planPath, "error", err)
		os.Exit(1)
	}

	slog.Info("loaded execution plan",
		"pipeline", plan.PipelineName,
		"operators", len(plan.Operators),
		"edges", len(plan.Edges),
	)

	// Create the engine with default allocator.
	alloc := memory.DefaultAllocator
	eng := engine.NewEngine(plan, alloc, defaultFactory)

	// Run with graceful shutdown.
	if err := engine.RunWithGracefulShutdown(context.Background(), eng, 30*time.Second); err != nil {
		slog.Error("engine failed", "error", err)
		os.Exit(1)
	}
}

// defaultFactory creates operator instances from OperatorNode descriptors.
// This is a placeholder — real operator implementations will be registered here.
func defaultFactory(node *pb.OperatorNode) (interface{}, error) {
	return nil, fmt.Errorf("operator type %s not yet implemented", node.OperatorType)
}
