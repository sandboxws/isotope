## ADDED Requirements

### Requirement: S3-compatible checkpoint storage
Checkpoint snapshots SHALL be uploadable to S3-compatible object storage (S3, MinIO) for multi-node recovery. Upload SHALL be async (background after snapshot creation).

#### Scenario: Async snapshot upload
- **WHEN** a Pebble checkpoint is created locally
- **THEN** the snapshot files SHALL be uploaded to S3 in the background without blocking pipeline processing

### Requirement: Parallel download on restore
On recovery, checkpoint state SHALL be downloaded from S3 in parallel (concurrent file downloads) to minimize recovery time.

#### Scenario: Parallel state download
- **WHEN** recovering an operator with 1GB state from S3
- **THEN** the state SHALL be downloaded using parallel range requests for faster restore

### Requirement: Checkpoint storage abstraction
The checkpoint storage SHALL use an interface supporting local filesystem and S3, configured via the execution plan's StateConfig.

#### Scenario: Configurable storage backend
- **WHEN** the plan specifies `checkpoint_storage: "s3://bucket/checkpoints/"`
- **THEN** all checkpoint I/O SHALL use the S3 backend
