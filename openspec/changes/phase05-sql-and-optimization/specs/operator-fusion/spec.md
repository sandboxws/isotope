## ADDED Requirements

### Requirement: Fuse adjacent stateless operators
The optimizer SHALL identify chains of stateless operators (Filter → Map → Rename → Drop) connected by FORWARD edges and fuse them into a single "fused operator" that executes in one goroutine, eliminating inter-operator channel overhead.

#### Scenario: Three-operator fusion
- **WHEN** Filter → Map → Rename are all FORWARD-connected
- **THEN** the optimizer SHALL fuse them into a single operator that applies filter, map, and rename in sequence on each batch

### Requirement: Pipeline-breaking boundary detection
Fusion SHALL stop at pipeline-breaking boundaries: stateful operators, shuffle edges (HASH, BROADCAST), and operators requiring different execution strategies.

#### Scenario: Fusion stops at shuffle
- **WHEN** Filter → Map → HASH_SHUFFLE → Aggregate
- **THEN** only Filter and Map SHALL be fused; Aggregate remains separate

### Requirement: Reduced goroutine count
Operator fusion SHALL measurably reduce the goroutine count. The optimizer SHALL report: "Fused N operators into M, reducing goroutines by K."

#### Scenario: Goroutine reduction
- **WHEN** a pipeline has 8 stateless operators in a chain
- **THEN** fusion SHALL reduce them to 1, eliminating 7 goroutines and their channel overhead
