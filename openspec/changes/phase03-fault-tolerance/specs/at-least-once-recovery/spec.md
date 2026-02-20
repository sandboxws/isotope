## ADDED Requirements

### Requirement: Recovery from latest checkpoint
On process restart, the runtime SHALL: (1) find the latest completed checkpoint, (2) restore each operator's state from its snapshot, (3) reset Kafka source offsets to the checkpointed positions, (4) resume processing.

#### Scenario: Recover from checkpoint after crash
- **WHEN** the runtime crashes and restarts, with checkpoint 42 as the latest complete checkpoint
- **THEN** each operator's Pebble state SHALL be restored from checkpoint 42's snapshots and Kafka sources SHALL resume from checkpoint 42's offsets

### Requirement: Source replay
After recovery, Kafka sources SHALL replay records from the checkpointed offset. This means some records may be processed twice (at-least-once semantics). The runtime SHALL NOT guarantee no duplicates in non-transactional sinks.

#### Scenario: Kafka offset reset on recovery
- **WHEN** checkpoint 42 recorded Kafka partition 0 at offset 1000
- **THEN** on recovery, the Kafka source SHALL seek to offset 1000 and replay from there

### Requirement: Operator re-initialization
On recovery, each operator SHALL be re-initialized: `Open()` → `InitializeState(restored_backend)` → resume `ProcessBatch()`. The operator SHALL behave identically whether starting fresh or recovering.

#### Scenario: Stateful operator recovery
- **WHEN** a windowed aggregate operator recovers from checkpoint 42
- **THEN** its window state (accumulated records, trigger status) SHALL be identical to the state at checkpoint 42

### Requirement: Recovery time measurement
Recovery time SHALL be measured and logged: time to load metadata, time to restore state per operator, time to first output record after recovery.

#### Scenario: Recovery time target
- **WHEN** recovering a pipeline with 10GB total state from local checkpoint
- **THEN** recovery SHALL complete in ≤60 seconds
