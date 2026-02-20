## ADDED Requirements

### Requirement: Reactive scaling based on Kafka lag
The auto-scaler SHALL monitor Kafka consumer group lag. When lag exceeds the configured threshold for a sustained period, it SHALL trigger scale-up. When lag drops below a lower threshold, it SHALL trigger scale-down.

#### Scenario: Scale up on high lag
- **WHEN** Kafka consumer lag exceeds 10,000 for 5 consecutive measurement intervals
- **THEN** the auto-scaler SHALL increase parallelism by one step (e.g., 4→6)

#### Scenario: Scale down on low lag
- **WHEN** Kafka consumer lag stays below 100 for 10 consecutive measurement intervals
- **THEN** the auto-scaler SHALL decrease parallelism by one step (e.g., 8→6)

### Requirement: Cooldown period
After a scaling event, the auto-scaler SHALL enforce a cooldown period (default: 5 minutes) before considering another scaling action. This prevents oscillation.

#### Scenario: Cooldown prevents oscillation
- **WHEN** a scale-up occurs and lag temporarily spikes due to rebalancing
- **THEN** the auto-scaler SHALL NOT trigger another scale event during the cooldown period

### Requirement: Savepoint-based rescaling
Each auto-scaling event SHALL trigger a savepoint → redistribute → resume cycle as implemented in Phase 4.

#### Scenario: Auto-scale with state preservation
- **WHEN** the auto-scaler decides to scale from 4→8
- **THEN** it SHALL trigger a savepoint, stop the pipeline, rescale via key-group redistribution, and resume

### Requirement: Min/max parallelism bounds
The auto-scaler SHALL respect configured minimum and maximum parallelism bounds.

#### Scenario: Max parallelism enforced
- **WHEN** the auto-scaler wants to scale up but current parallelism equals max
- **THEN** it SHALL NOT scale beyond the max and SHALL log a warning
