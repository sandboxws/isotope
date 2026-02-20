## ADDED Requirements

### Requirement: Periodic checkpoint triggering
The checkpoint coordinator SHALL trigger checkpoints at a configurable interval (default: 10 seconds). Each checkpoint SHALL have a monotonically increasing checkpoint ID. A minimum pause between checkpoints SHALL be enforced to prevent overlapping checkpoints.

#### Scenario: Checkpoint triggered at interval
- **WHEN** the checkpoint interval is 10 seconds and 10 seconds have elapsed since the last checkpoint
- **THEN** the coordinator SHALL trigger a new checkpoint with the next checkpoint ID

#### Scenario: Minimum pause enforced
- **WHEN** a checkpoint completes and the minimum pause is 5 seconds
- **THEN** the next checkpoint SHALL not be triggered until at least 5 seconds after completion

### Requirement: Barrier injection into sources
When a checkpoint is triggered, the coordinator SHALL inject a `CheckpointBarrier` message into all source operators. The barrier contains the checkpoint ID and timestamp.

#### Scenario: Barrier injection
- **WHEN** checkpoint 42 is triggered with 3 source operators
- **THEN** all 3 sources SHALL receive a CheckpointBarrier with `checkpoint_id: 42`

### Requirement: Checkpoint timeout
If a checkpoint does not complete within a configurable timeout (default: 10 minutes), the coordinator SHALL abort the checkpoint and log a warning. Timed-out checkpoints SHALL NOT affect pipeline execution.

#### Scenario: Checkpoint timeout
- **WHEN** a checkpoint does not receive all acknowledgements within the timeout
- **THEN** the coordinator SHALL abort it, clean up partial state, and schedule the next checkpoint normally
