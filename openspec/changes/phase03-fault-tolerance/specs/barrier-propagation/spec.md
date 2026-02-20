## ADDED Requirements

### Requirement: Barrier forwarding through operators
When an operator receives a CheckpointBarrier, it SHALL: (1) snapshot its state, (2) forward the barrier downstream. For stateless operators, only step 2 applies.

#### Scenario: Stateful operator barrier handling
- **WHEN** a windowed aggregate operator receives CheckpointBarrier(42)
- **THEN** it SHALL snapshot its Pebble state, then forward barrier 42 to all downstream operators

### Requirement: Barrier alignment at multi-input operators
Multi-input operators (Join, Union) SHALL implement barrier alignment: when a barrier arrives from one input, the operator SHALL buffer records from that input until barriers from ALL inputs have arrived. Only then SHALL the operator snapshot state and forward the barrier.

#### Scenario: Aligned barrier at two-input join
- **WHEN** a Join operator receives barrier 42 from the left input but not yet from the right
- **THEN** it SHALL buffer all subsequent left-input records until barrier 42 arrives from the right

#### Scenario: Complete alignment triggers snapshot
- **WHEN** barrier 42 has arrived from both inputs of a Join operator
- **THEN** the operator SHALL process all buffered records, snapshot state, and forward barrier 42 downstream

### Requirement: Alignment buffer memory management
The barrier alignment buffer SHALL have a configurable maximum size. If the buffer exceeds the limit, the checkpoint SHALL be aborted for that operator (triggering overall checkpoint failure).

#### Scenario: Buffer overflow
- **WHEN** the alignment buffer reaches its maximum size (e.g., 1GB)
- **THEN** the operator SHALL report checkpoint failure to the coordinator
