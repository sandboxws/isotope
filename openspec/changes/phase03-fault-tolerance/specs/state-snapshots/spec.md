## ADDED Requirements

### Requirement: Pebble checkpoint snapshots
State snapshots SHALL use Pebble's `Checkpoint()` method, which creates a consistent snapshot via hardlinks in ~1ms regardless of state size. The snapshot directory SHALL be named by checkpoint ID.

#### Scenario: Fast snapshot creation
- **WHEN** an operator with 10GB of state receives a barrier
- **THEN** Pebble `Checkpoint()` SHALL create a hardlinked snapshot in < 10ms

### Requirement: Snapshot metadata
Each checkpoint SHALL store metadata: checkpoint ID, timestamp, per-operator state paths, source offsets (Kafka partition → offset), and completion status.

#### Scenario: Checkpoint metadata contains offsets
- **WHEN** checkpoint 42 completes with Kafka source at partition 0 offset 1000, partition 1 offset 2000
- **THEN** the metadata SHALL record these offsets for recovery

### Requirement: Checkpoint storage
Checkpoint snapshots and metadata SHALL be stored on the local filesystem (path configurable). Phase 4 will add remote storage (S3).

#### Scenario: Local checkpoint storage
- **WHEN** checkpoint 42 completes
- **THEN** snapshot data SHALL exist at `{checkpoint_dir}/checkpoint-42/` with state and metadata files

### Requirement: Old checkpoint cleanup
The coordinator SHALL retain the N most recent completed checkpoints (configurable, default: 3) and delete older ones to reclaim disk space.

#### Scenario: Checkpoint cleanup
- **WHEN** checkpoint 45 completes and retain_count=3
- **THEN** checkpoints 43, 44, 45 SHALL be retained and checkpoint 42 (and older) SHALL be deleted
