## ADDED Requirements

### Requirement: Two-phase commit coordinator
The runtime SHALL implement a 2PC coordinator for end-to-end exactly-once across all sinks. Phase 1 (prepare): on barrier receipt, each sink pre-commits. Phase 2 (commit): on checkpoint-complete, coordinator tells all sinks to commit. On failure: coordinator tells all sinks to abort.

#### Scenario: Successful 2PC flow
- **WHEN** checkpoint 42 completes with 2 transactional sinks
- **THEN** both sinks SHALL receive commit signal and finalize their transactions

#### Scenario: 2PC abort on sink failure
- **WHEN** one sink fails to pre-commit during checkpoint 42
- **THEN** the coordinator SHALL send abort to all sinks and fail the checkpoint

### Requirement: Timeout handling for 2PC
If a sink does not respond to commit/abort within a timeout, the coordinator SHALL log an error. On recovery, pending transactions SHALL be resolved (committed if checkpoint was complete, aborted otherwise).

#### Scenario: Pending transaction resolution on recovery
- **WHEN** the runtime crashes after checkpoint 42 was marked complete but before sink commit
- **THEN** on recovery, the coordinator SHALL commit pending transactions for checkpoint 42
