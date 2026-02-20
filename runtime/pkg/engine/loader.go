package engine

import (
	"fmt"
	"os"

	pb "github.com/sandboxws/isotope/runtime/internal/proto/isotope/v1"
	"google.golang.org/protobuf/proto"
)

// LoadPlan reads a serialized ExecutionPlan from a file path.
func LoadPlan(path string) (*pb.ExecutionPlan, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read plan file %s: %w", path, err)
	}
	return DeserializePlan(data)
}

// DeserializePlan parses a serialized ExecutionPlan from bytes.
func DeserializePlan(data []byte) (*pb.ExecutionPlan, error) {
	plan := &pb.ExecutionPlan{}
	if err := proto.Unmarshal(data, plan); err != nil {
		return nil, fmt.Errorf("unmarshal execution plan: %w", err)
	}
	return plan, nil
}
