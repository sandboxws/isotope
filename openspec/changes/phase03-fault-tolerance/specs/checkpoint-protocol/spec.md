## ADDED Requirements

### Requirement: Operator acknowledgement
After snapshotting state and forwarding the barrier, each operator SHALL send an acknowledgement to the coordinator containing: operator ID, checkpoint ID, state snapshot path, and source offsets (for source operators).

#### Scenario: Operator acknowledges checkpoint
- **WHEN** operator "filter_0" completes checkpoint 42
- **THEN** it SHALL send ack(operator_id="filter_0", checkpoint_id=42, snapshot_path="...") to the coordinator

### Requirement: Checkpoint completion detection
The coordinator SHALL mark a checkpoint as complete when ALL operators have acknowledged. Sink operators acknowledge last (after pre-commit).

#### Scenario: All operators acknowledge
- **WHEN** all 5 operators acknowledge checkpoint 42
- **THEN** the coordinator SHALL mark checkpoint 42 as complete and trigger commit phase

### Requirement: Partial failure handling
If any operator fails to acknowledge (timeout or error), the coordinator SHALL abort the checkpoint. Running operators SHALL discard their snapshots for that checkpoint ID.

#### Scenario: One operator fails to acknowledge
- **WHEN** 4 of 5 operators acknowledge checkpoint 42 but operator "join_0" times out
- **THEN** the coordinator SHALL abort checkpoint 42 and clean up partial snapshots
