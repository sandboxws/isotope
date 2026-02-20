// Package engine implements the core execution engine that builds an operator DAG
// from a Protobuf ExecutionPlan and runs operators as goroutines wired by channels.
package engine

import (
	"context"
	"fmt"
	"log/slog"
	"sync"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/memory"

	pb "github.com/sandboxws/isotope/runtime/internal/proto/isotope/v1"
	"github.com/sandboxws/isotope/runtime/pkg/operator"
)

const defaultChannelBuffer = 16

// OperatorFactory creates an Operator (or Source/Sink) from an OperatorNode descriptor.
type OperatorFactory func(node *pb.OperatorNode) (interface{}, error)

// Engine executes an operator DAG from an ExecutionPlan.
type Engine struct {
	plan    *pb.ExecutionPlan
	alloc   memory.Allocator
	factory OperatorFactory
	logger  *slog.Logger

	// Runtime state.
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// NewEngine creates a new execution engine for the given plan.
func NewEngine(plan *pb.ExecutionPlan, alloc memory.Allocator, factory OperatorFactory) *Engine {
	return &Engine{
		plan:    plan,
		alloc:   alloc,
		factory: factory,
		logger:  slog.Default().With("pipeline", plan.PipelineName),
	}
}

// operatorInstance holds an instantiated operator with its metadata.
type operatorInstance struct {
	node     *pb.OperatorNode
	impl     interface{} // operator.Operator, operator.Source, or operator.Sink
	inputChs []chan arrow.Record
	outputCh chan arrow.Record
}

// Run builds the DAG, wires channels, and starts all operators.
// Blocks until ctx is cancelled or all operators complete.
func (e *Engine) Run(ctx context.Context) error {
	ctx, e.cancel = context.WithCancel(ctx)
	defer e.cancel()

	if err := ValidatePlan(e.plan); err != nil {
		return fmt.Errorf("invalid plan: %w", err)
	}

	// Build the adjacency lists.
	adj := buildAdjacency(e.plan)

	// Identify chains of FORWARD-connected operators for fusion.
	chains := identifyChains(e.plan, adj)

	// Create operator instances.
	instances := make(map[string]*operatorInstance)
	for _, op := range e.plan.Operators {
		impl, err := e.factory(op)
		if err != nil {
			return fmt.Errorf("create operator %s (%s): %w", op.Id, op.Name, err)
		}
		instances[op.Id] = &operatorInstance{
			node: op,
			impl: impl,
		}
	}

	// Create channels between non-chained operators.
	for _, edge := range e.plan.Edges {
		// Skip channel creation for FORWARD edges within a chain.
		if isChainedEdge(chains, edge.FromOperator, edge.ToOperator) {
			continue
		}

		ch := make(chan arrow.Record, defaultChannelBuffer)
		instances[edge.FromOperator].outputCh = ch
		instances[edge.ToOperator].inputChs = append(instances[edge.ToOperator].inputChs, ch)
	}

	// Start operators.
	for _, chain := range chains {
		if len(chain) > 1 {
			// Fused chain: run all chained operators in a single goroutine.
			e.startChain(ctx, chain, instances)
		} else {
			e.startSingle(ctx, chain[0], instances)
		}
	}

	// Start standalone operators not in any chain.
	inChain := make(map[string]bool)
	for _, chain := range chains {
		for _, id := range chain {
			inChain[id] = true
		}
	}
	for _, op := range e.plan.Operators {
		if !inChain[op.Id] {
			e.startSingle(ctx, op.Id, instances)
		}
	}

	// Wait for all goroutines to finish.
	e.wg.Wait()
	return nil
}

// Stop triggers a graceful shutdown.
func (e *Engine) Stop() {
	if e.cancel != nil {
		e.cancel()
	}
}

// startSingle starts a single operator in its own goroutine.
func (e *Engine) startSingle(ctx context.Context, opID string, instances map[string]*operatorInstance) {
	inst := instances[opID]
	opCtx := operator.NewContext(ctx, e.alloc, inst.node.Id, inst.node.Name)

	switch impl := inst.impl.(type) {
	case operator.Source:
		// Sources need an output channel.
		if inst.outputCh == nil {
			inst.outputCh = make(chan arrow.Record, defaultChannelBuffer)
		}
		e.wg.Add(1)
		go func() {
			defer e.wg.Done()
			if err := impl.Open(opCtx); err != nil {
				e.logger.Error("source open failed", "operator", opID, "error", err)
				return
			}
			defer impl.Close()
			if err := impl.Run(opCtx, inst.outputCh); err != nil {
				e.logger.Error("source run failed", "operator", opID, "error", err)
			}
		}()

	case operator.Sink:
		e.wg.Add(1)
		go func() {
			defer e.wg.Done()
			if err := impl.Open(opCtx); err != nil {
				e.logger.Error("sink open failed", "operator", opID, "error", err)
				return
			}
			defer impl.Close()
			for _, inCh := range inst.inputChs {
				for batch := range inCh {
					if err := impl.WriteBatch(batch); err != nil {
						e.logger.Error("sink write failed", "operator", opID, "error", err)
					}
					batch.Release()
				}
			}
		}()

	case operator.Operator:
		e.wg.Add(1)
		go func() {
			defer e.wg.Done()
			if err := impl.Open(opCtx); err != nil {
				e.logger.Error("operator open failed", "operator", opID, "error", err)
				return
			}
			defer impl.Close()
			if inst.outputCh != nil {
				defer close(inst.outputCh)
			}

			for _, inCh := range inst.inputChs {
				for batch := range inCh {
					outputs, err := impl.ProcessBatch(batch)
					batch.Release()
					if err != nil {
						e.logger.Error("process batch failed", "operator", opID, "error", err)
						continue
					}
					for _, out := range outputs {
						if inst.outputCh != nil {
							inst.outputCh <- out
						} else {
							out.Release()
						}
					}
				}
			}
		}()
	}
}

// startChain runs a fused chain of FORWARD-connected operators in a single goroutine.
func (e *Engine) startChain(ctx context.Context, chain []string, instances map[string]*operatorInstance) {
	if len(chain) == 0 {
		return
	}

	// Collect all operators in the chain.
	ops := make([]operator.Operator, 0, len(chain))
	for _, id := range chain {
		inst := instances[id]
		op, ok := inst.impl.(operator.Operator)
		if !ok {
			// Sources and sinks cannot be in the middle of a chain.
			e.logger.Warn("non-operator in chain, falling back to individual start", "operator", id)
			for _, cid := range chain {
				e.startSingle(ctx, cid, instances)
			}
			return
		}
		ops = append(ops, op)
	}

	// The chain's input comes from the first operator's input channels.
	firstInst := instances[chain[0]]
	// The chain's output goes to the last operator's output channel.
	lastInst := instances[chain[len(chain)-1]]

	e.wg.Add(1)
	go func() {
		defer e.wg.Done()

		// Open all operators in the chain.
		for i, id := range chain {
			opCtx := operator.NewContext(ctx, e.alloc, id, instances[id].node.Name)
			if err := ops[i].Open(opCtx); err != nil {
				e.logger.Error("chain operator open failed", "operator", id, "error", err)
				return
			}
		}
		defer func() {
			for _, op := range ops {
				op.Close()
			}
		}()

		if lastInst.outputCh != nil {
			defer close(lastInst.outputCh)
		}

		// Process batches through the chain.
		for _, inCh := range firstInst.inputChs {
			for batch := range inCh {
				// Pipeline the batch through each operator in sequence.
				batches := []arrow.Record{batch}
				for _, op := range ops {
					var nextBatches []arrow.Record
					for _, b := range batches {
						outputs, err := op.ProcessBatch(b)
						b.Release()
						if err != nil {
							e.logger.Error("chain process batch failed", "error", err)
							continue
						}
						nextBatches = append(nextBatches, outputs...)
					}
					batches = nextBatches
				}

				// Emit final results.
				for _, out := range batches {
					if lastInst.outputCh != nil {
						lastInst.outputCh <- out
					} else {
						out.Release()
					}
				}
			}
		}
	}()
}

// adjacency represents the DAG adjacency lists.
type adjacency struct {
	downstream map[string][]edgeInfo
	upstream   map[string][]edgeInfo
}

type edgeInfo struct {
	operatorID string
	shuffle    pb.ShuffleStrategy
}

func buildAdjacency(plan *pb.ExecutionPlan) adjacency {
	adj := adjacency{
		downstream: make(map[string][]edgeInfo),
		upstream:   make(map[string][]edgeInfo),
	}
	for _, edge := range plan.Edges {
		adj.downstream[edge.FromOperator] = append(adj.downstream[edge.FromOperator],
			edgeInfo{operatorID: edge.ToOperator, shuffle: edge.Shuffle})
		adj.upstream[edge.ToOperator] = append(adj.upstream[edge.ToOperator],
			edgeInfo{operatorID: edge.FromOperator, shuffle: edge.Shuffle})
	}
	return adj
}

// identifyChains finds sequences of operators connected by FORWARD edges
// where each operator has exactly one downstream and one upstream (linear chain).
func identifyChains(plan *pb.ExecutionPlan, adj adjacency) [][]string {
	var chains [][]string
	visited := make(map[string]bool)

	// Find chain starts: operators that have upstream edges and a single FORWARD downstream.
	// Exclude sources (no upstream) and sinks (no downstream) from chain heads.
	for _, op := range plan.Operators {
		if visited[op.Id] {
			continue
		}

		// Sources have no upstream edges — don't start chains from them.
		ups := adj.upstream[op.Id]
		if len(ups) == 0 {
			continue
		}

		// Check if this operator starts a FORWARD chain.
		downs := adj.downstream[op.Id]
		if len(downs) != 1 || downs[0].shuffle != pb.ShuffleStrategy_SHUFFLE_STRATEGY_FORWARD {
			continue
		}

		// Walk the chain forward.
		chain := []string{op.Id}
		visited[op.Id] = true
		current := downs[0].operatorID

		for {
			ups := adj.upstream[current]
			downs := adj.downstream[current]

			// Must have exactly one FORWARD upstream and at least one downstream
			// (exclude sinks which have no downstream edges).
			if len(ups) != 1 || ups[0].shuffle != pb.ShuffleStrategy_SHUFFLE_STRATEGY_FORWARD || len(downs) == 0 {
				break
			}

			chain = append(chain, current)
			visited[current] = true

			// Continue if there's exactly one FORWARD downstream.
			if len(downs) != 1 || downs[0].shuffle != pb.ShuffleStrategy_SHUFFLE_STRATEGY_FORWARD {
				break
			}
			current = downs[0].operatorID
		}

		if len(chain) > 1 {
			chains = append(chains, chain)
		}
	}

	return chains
}

// isChainedEdge checks if two operators are adjacent within the same chain.
func isChainedEdge(chains [][]string, from, to string) bool {
	for _, chain := range chains {
		for i := 0; i < len(chain)-1; i++ {
			if chain[i] == from && chain[i+1] == to {
				return true
			}
		}
	}
	return false
}
