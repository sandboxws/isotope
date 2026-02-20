package engine

import (
	"fmt"
	"strings"

	pb "github.com/sandboxws/isotope/runtime/internal/proto/isotope/v1"
)

// ValidatePlan checks the execution plan for structural integrity.
func ValidatePlan(plan *pb.ExecutionPlan) error {
	if plan.PipelineName == "" {
		return fmt.Errorf("pipeline_name is required")
	}

	if len(plan.Operators) == 0 {
		return fmt.Errorf("plan must contain at least one operator")
	}

	// Build operator lookup.
	operatorIDs := make(map[string]*pb.OperatorNode, len(plan.Operators))
	for _, op := range plan.Operators {
		if op.Id == "" {
			return fmt.Errorf("operator has empty id")
		}
		if _, exists := operatorIDs[op.Id]; exists {
			return fmt.Errorf("duplicate operator id: %s", op.Id)
		}
		operatorIDs[op.Id] = op
	}

	// Validate edges reference existing operators.
	for i, edge := range plan.Edges {
		if _, ok := operatorIDs[edge.FromOperator]; !ok {
			return fmt.Errorf("edge[%d]: from_operator %q does not exist", i, edge.FromOperator)
		}
		if _, ok := operatorIDs[edge.ToOperator]; !ok {
			return fmt.Errorf("edge[%d]: to_operator %q does not exist", i, edge.ToOperator)
		}
		if edge.FromOperator == edge.ToOperator {
			return fmt.Errorf("edge[%d]: self-loop on operator %q", i, edge.FromOperator)
		}
	}

	// Check for DAG cycles using DFS.
	if err := detectCycles(plan); err != nil {
		return err
	}

	// Validate schema consistency across edges.
	if err := validateSchemaConsistency(plan, operatorIDs); err != nil {
		return err
	}

	return nil
}

// detectCycles performs a DFS-based cycle check on the operator DAG.
func detectCycles(plan *pb.ExecutionPlan) error {
	adj := make(map[string][]string)
	for _, edge := range plan.Edges {
		adj[edge.FromOperator] = append(adj[edge.FromOperator], edge.ToOperator)
	}

	const (
		white = 0 // unvisited
		gray  = 1 // visiting (in current path)
		black = 2 // done
	)

	color := make(map[string]int)
	var path []string

	var dfs func(node string) error
	dfs = func(node string) error {
		color[node] = gray
		path = append(path, node)

		for _, next := range adj[node] {
			switch color[next] {
			case gray:
				// Found a cycle — find start of cycle in path.
				cycleStart := -1
				for i, n := range path {
					if n == next {
						cycleStart = i
						break
					}
				}
				cycle := append(path[cycleStart:], next)
				return fmt.Errorf("cycle detected: %s", strings.Join(cycle, " -> "))
			case white:
				if err := dfs(next); err != nil {
					return err
				}
			}
		}

		path = path[:len(path)-1]
		color[node] = black
		return nil
	}

	for _, op := range plan.Operators {
		if color[op.Id] == white {
			if err := dfs(op.Id); err != nil {
				return err
			}
		}
	}

	return nil
}

// validateSchemaConsistency checks that connected operators have compatible schemas.
func validateSchemaConsistency(plan *pb.ExecutionPlan, ops map[string]*pb.OperatorNode) error {
	for i, edge := range plan.Edges {
		from := ops[edge.FromOperator]
		to := ops[edge.ToOperator]

		// Skip validation if schemas are not set (will be resolved by the compiler).
		if from.OutputSchema == nil || to.InputSchema == nil {
			continue
		}

		if err := schemasCompatible(from.OutputSchema, to.InputSchema); err != nil {
			return fmt.Errorf("edge[%d] (%s -> %s): schema mismatch: %w",
				i, edge.FromOperator, edge.ToOperator, err)
		}
	}
	return nil
}

// schemasCompatible checks if two schemas are compatible (same fields in same order with compatible types).
func schemasCompatible(output, input *pb.Schema) error {
	if len(output.Fields) != len(input.Fields) {
		return fmt.Errorf("field count mismatch: output has %d, input has %d",
			len(output.Fields), len(input.Fields))
	}

	for i := range output.Fields {
		of := output.Fields[i]
		inf := input.Fields[i]

		if of.Name != inf.Name {
			return fmt.Errorf("field[%d] name mismatch: output %q vs input %q", i, of.Name, inf.Name)
		}
		if of.ArrowType != inf.ArrowType {
			return fmt.Errorf("field %q type mismatch: output %v vs input %v", of.Name, of.ArrowType, inf.ArrowType)
		}
	}

	return nil
}
