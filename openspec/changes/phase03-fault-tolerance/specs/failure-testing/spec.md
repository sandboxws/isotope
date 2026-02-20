## ADDED Requirements

### Requirement: Kill-and-recover test suite
The test suite SHALL include tests that kill the runtime process at random points during execution and verify correct recovery: no data loss (at-least-once) or no duplicates (exactly-once with transactional sinks).

#### Scenario: Kill during checkpoint
- **WHEN** the runtime is killed while a checkpoint is in progress
- **THEN** on recovery, it SHALL fall back to the previous completed checkpoint and replay correctly

#### Scenario: Kill between checkpoints
- **WHEN** the runtime is killed between checkpoints
- **THEN** on recovery, it SHALL restore from the last completed checkpoint and replay from those offsets

### Requirement: State corruption detection
The runtime SHALL compute checksums for state snapshots. On restore, checksums SHALL be verified to detect corruption.

#### Scenario: Corrupted snapshot detection
- **WHEN** a snapshot file is corrupted (bit flip)
- **THEN** the checksum verification SHALL fail and recovery SHALL fall back to the previous checkpoint

### Requirement: Checkpoint timeout handling test
Tests SHALL verify that checkpoint timeouts are handled gracefully: the pipeline continues processing, the timed-out checkpoint is discarded, and the next checkpoint succeeds.

#### Scenario: Slow operator causes timeout
- **WHEN** an operator takes 15 minutes to snapshot (exceeding 10-minute timeout)
- **THEN** the checkpoint SHALL be aborted, the pipeline SHALL continue, and the next checkpoint SHALL succeed
