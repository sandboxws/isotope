## ADDED Requirements

### Requirement: Hash partitioner
The hash partitioner SHALL distribute RecordBatch rows across N downstream instances using `Murmur3(key_columns) % N`. Rows with the same key SHALL always go to the same partition.

#### Scenario: Consistent hash distribution
- **WHEN** 10,000 rows are partitioned by `user_id` across 4 instances
- **THEN** each row SHALL be deterministically assigned to one of 4 partitions, with rows sharing the same `user_id` in the same partition

### Requirement: Broadcast partitioner
The broadcast partitioner SHALL send a complete copy of each RecordBatch to ALL downstream instances. Used for small-table broadcast joins.

#### Scenario: Broadcast to all instances
- **WHEN** a RecordBatch is broadcast to 4 downstream instances
- **THEN** all 4 instances SHALL receive an identical copy of the batch

### Requirement: Round-robin partitioner
The round-robin partitioner SHALL distribute RecordBatches evenly across downstream instances in rotation. Used for stateless operators where key affinity is not needed.

#### Scenario: Even distribution
- **WHEN** 8 RecordBatches are distributed round-robin across 4 instances
- **THEN** each instance SHALL receive exactly 2 batches

### Requirement: Range partitioner
The range partitioner SHALL split a key range into N contiguous subranges, assigning records by key value. Used for ordered operations.

#### Scenario: Range-based distribution
- **WHEN** records with keys 1-1000 are partitioned into 4 ranges
- **THEN** keys 1-250 go to instance 0, 251-500 to instance 1, etc.
