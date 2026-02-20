## ADDED Requirements

### Requirement: JDBC upsert for idempotent writes
The JDBC sink in upsert mode SHALL provide exactly-once semantics without transactions: `INSERT ... ON CONFLICT (key_fields) DO UPDATE SET ...` ensures replayed records overwrite duplicates.

#### Scenario: Idempotent upsert on replay
- **WHEN** a record with `user_id=42, count=100` is written, then replayed after recovery
- **THEN** the upsert SHALL update the existing row, resulting in exactly one row for user_id=42

### Requirement: Kafka key-based deduplication
For non-transactional Kafka sinks, the runtime SHALL support embedding a deduplication key (checkpoint_id + sequence_number) in message headers. Consumers can use this for client-side dedup.

#### Scenario: Dedup header in Kafka messages
- **WHEN** a Kafka sink produces a message during checkpoint 42
- **THEN** the message SHALL include headers with `isotope-checkpoint-id: 42` and `isotope-sequence: N`
